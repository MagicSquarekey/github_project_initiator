/**
 * 本机资源采集：CPU / 内存 / 磁盘 / GPU。
 *
 * 只依赖 Node 内置模块和系统自带命令，Windows / Ubuntu 通用：
 *   - CPU/内存：os（Linux 读 /proc/meminfo 的 MemAvailable，比 os.freemem 准）
 *   - 磁盘：Windows 用 fs.statfs 遍历盘符；Linux 用 df -kPT
 *   - GPU：nvidia-smi（两家都支持，利用率/显存/温度）；没有 nvidia-smi 时
 *     只列型号（Windows Win32_VideoController / Linux lspci）
 *
 * 分项缓存：nvidia-smi、df 都是子进程，不能让前端轮询反复起进程。
 */

import fs from 'node:fs';
import os from 'node:os';
import { exec, execPowershell } from '../util/exec.js';

const IS_WINDOWS = process.platform === 'win32';

/* ============================================================
   CPU
   ============================================================ */

let lastCpu = null;

function snapshotCpu() {
  return os.cpus().map((c) => ({
    idle: c.times.idle,
    total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
  }));
}

// 模块加载即取一次基线：第一次请求就能算出真实利用率，而不是 0%
lastCpu = snapshotCpu();

/**
 * 两次 os.cpus 快照之间的利用率（纯函数，便于单测）。
 *
 * @param {{ idle: number, total: number }[]} prev
 * @param {{ idle: number, total: number }[]} cur
 * @returns {{ usage: number, perCore: number[] }}
 */
export function cpuUsageBetween(prev, cur) {
  const perCore = [];
  let idle = 0;
  let total = 0;
  for (let i = 0; i < cur.length; i++) {
    const p = prev[i] || cur[i];
    const dTotal = cur[i].total - p.total;
    const dIdle = cur[i].idle - p.idle;
    if (dTotal > 0) {
      perCore.push(Math.min(1, Math.max(0, 1 - dIdle / dTotal)));
      idle += dIdle;
      total += dTotal;
    } else {
      perCore.push(0);
    }
  }
  return { usage: total > 0 ? Math.min(1, Math.max(0, 1 - idle / total)) : 0, perCore };
}

function sampleCpu() {
  const cur = snapshotCpu();
  if (!lastCpu) {
    lastCpu = cur;
    return { usage: 0, perCore: cur.map(() => 0) };
  }
  const r = cpuUsageBetween(lastCpu, cur);
  lastCpu = cur;
  return r;
}

/* ============================================================
   内存
   ============================================================ */

function readMemory() {
  if (!IS_WINDOWS) {
    try {
      const raw = fs.readFileSync('/proc/meminfo', 'utf8');
      const kb = (key) => {
        const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm'));
        return m ? Number(m[1]) * 1024 : 0;
      };
      const total = kb('MemTotal');
      const avail = kb('MemAvailable') || kb('MemFree');
      if (total > 0) {
        return { totalBytes: total, usedBytes: total - avail, usage: (total - avail) / total };
      }
    } catch {
      // 回退到 os
    }
  }
  const total = os.totalmem();
  const free = os.freemem();
  return { totalBytes: total, usedBytes: total - free, usage: total > 0 ? (total - free) / total : 0 };
}

/* ============================================================
   磁盘
   ============================================================ */

const DISK_TTL = 15000;
let diskCache = { at: 0, value: [] };

function windowsDisks() {
  const out = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const mount = `${letter}:\\`;
    try {
      const s = fs.statfsSync(mount);
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      if (total > 0) {
        out.push({
          label: `${letter}:`,
          mount,
          totalBytes: total,
          usedBytes: total - free,
          usage: (total - free) / total,
        });
      }
    } catch {
      // 盘符不存在/未挂载：跳过
    }
  }
  return out;
}

/**
 * 解析 df -kPT 输出（纯函数）。
 *
 * 形如：/dev/sda1 ext4 1024000 512000 512000 50% /
 *
 * @param {string} output
 * @returns {{ label: string, mount: string, totalBytes: number, usedBytes: number, usage: number }[]}
 */
export function parseDf(output) {
  const disks = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) continue;
    if (parts[0] === 'Filesystem') continue;
    const [, type, blocks, used, avail] = parts;
    const mount = parts.slice(6).join(' ');
    if (
      /^(tmpfs|devtmpfs|overlay|squashfs|proc|sysfs|cgroup2?|ramfs|devpts|mqueue|hugetlbfs|pstore|debugfs|tracefs|securityfs|fusectl|configfs|binfmt_misc|autofs|nsfs|fuse\..*)$/i.test(
        type,
      )
    ) {
      continue;
    }
    if (mount.startsWith('/snap/')) continue;
    const usedBytes = Number(used) * 1024;
    const availBytes = Number(avail) * 1024;
    const total = Number(blocks) * 1024 || usedBytes + availBytes;
    if (!total) continue;
    disks.push({ label: mount, mount, totalBytes: total, usedBytes, usage: usedBytes / total });
  }
  return disks;
}

async function collectDisks() {
  const now = Date.now();
  if (now - diskCache.at < DISK_TTL) return diskCache.value;

  let value = [];
  if (IS_WINDOWS) {
    value = windowsDisks();
  } else {
    const r = await exec('df', ['-kPT'], { timeoutMs: 5000 });
    if (r.ok) value = parseDf(r.stdout);
  }
  diskCache = { at: now, value };
  return value;
}

/* ============================================================
   GPU
   ============================================================ */

const GPU_TTL = 3000;
const GPU_NAME_TTL = 60000;
let gpuCache = { at: 0, value: null };
let gpuNameCache = { at: 0, value: null };

/**
 * 解析 nvidia-smi CSV 输出（纯函数）。
 *
 * 输入形如：0, NVIDIA GeForce GTX 1660 SUPER, 12, 2587, 6144, 48
 *
 * @param {string} output
 * @returns {any[]}
 */
export function parseNvidiaSmi(output) {
  const gpus = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    const cells = text.split(',').map((s) => s.trim());
    if (cells.length < 6) continue;

    const num = (s) => (/^\d+(?:\.\d+)?$/.test(s) ? Number(s) : null);
    const index = num(cells[0]);
    const util = num(cells[2]);
    const memUsed = num(cells[3]);
    const memTotal = num(cells[4]);
    const temp = num(cells[5]);

    gpus.push({
      index: index === null ? gpus.length : index,
      name: cells[1],
      util: util === null ? null : util / 100,
      memUsedBytes: memUsed === null ? null : memUsed * 1024 * 1024,
      memTotalBytes: memTotal === null ? null : memTotal * 1024 * 1024,
      tempC: temp,
      source: 'nvidia-smi',
    });
  }
  return gpus;
}

/**
 * 解析 lspci -mm 里 VGA/3D 的型号（纯函数）。
 *
 * 形如："0000:01:00.0" "VGA compatible controller" "NVIDIA Corporation" "GA106 [GeForce GTX 1660 SUPER]"
 *
 * @param {string} output
 * @returns {string[]}
 */
export function parseLspciGpuNames(output) {
  const names = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!/(VGA compatible controller|3D controller|Display controller)/i.test(line)) continue;
    const quoted = line.match(/"([^"]*)"/g)?.map((s) => s.slice(1, -1)) || [];
    const name = quoted[3] || quoted[2];
    if (name) names.push(name);
  }
  return names;
}

async function windowsGpuNames() {
  const script =
    "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Virtual|Idd|ToDesk|GameViewer|Oray|Parsec|Basic' } | Select-Object -ExpandProperty Name";
  const r = await execPowershell(script, { timeoutMs: 8000 });
  if (!r.ok) return [];
  return r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function linuxGpuNames() {
  const r = await exec('lspci', ['-mm'], { timeoutMs: 5000 });
  return r.ok ? parseLspciGpuNames(r.stdout) : [];
}

async function collectGpus() {
  const now = Date.now();
  if (gpuCache.value && now - gpuCache.at < GPU_TTL) return gpuCache.value;

  const r = await exec(
    'nvidia-smi',
    [
      '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu',
      '--format=csv,noheader,nounits',
    ],
    { timeoutMs: 5000 },
  );
  let gpus = r.ok ? parseNvidiaSmi(r.stdout) : [];

  if (gpus.length === 0) {
    if (!gpuNameCache.value || now - gpuNameCache.at > GPU_NAME_TTL) {
      const names = IS_WINDOWS ? await windowsGpuNames() : await linuxGpuNames();
      gpuNameCache = { at: now, value: names };
    }
    gpus = (gpuNameCache.value || []).map((name, i) => ({
      index: i,
      name,
      util: null,
      memUsedBytes: null,
      memTotalBytes: null,
      tempC: null,
      source: 'name',
    }));
  }

  gpuCache = { at: now, value: gpus };
  return gpus;
}

/* ============================================================
   汇总
   ============================================================ */

/**
 * 采集一次本机资源快照。
 *
 * @returns {Promise<{ hostname: string, platform: string, uptimeSec: number, cpu: any, memory: any, disks: any[], gpus: any[] }>}
 */
export async function collectHostStats() {
  const cpu = sampleCpu();
  const memory = readMemory();
  const [disks, gpus] = await Promise.all([collectDisks(), collectGpus()]);

  return {
    hostname: os.hostname(),
    platform: process.platform === 'win32' ? 'windows' : process.platform,
    uptimeSec: Math.floor(os.uptime()),
    cpu: {
      usage: cpu.usage,
      perCore: cpu.perCore,
      cores: cpu.perCore.length,
      model: os.cpus()[0]?.model || '',
      load: process.platform === 'linux' ? os.loadavg().map((n) => +n.toFixed(2)) : null,
    },
    memory,
    disks,
    gpus,
  };
}
