/**
 * 平台适配层：把"端口反查 PID""按名杀进程""按 PID 杀"这些
 * 平台强相关的操作收敛到一处，上层完全不感知平台差异。
 *
 * 为什么需要这一层：管理器要在 Windows 和 Linux/macOS 上跑同一份代码。
 * Windows 用 netstat/tasklist/taskkill，POSIX 用 ss/lsof/pkill/kill，
 * 输出格式、字段位置、信号语义全都不同。散落在业务代码里会让每个调用点
 * 都要判平台，必然漏。
 *
 * 支持矩阵：
 *   win32   netstat -ano / tasklist / taskkill    完整支持
 *   linux   ss -ltnp / ps / pkill / kill          完整支持（需 procps + iproute2）
 *   darwin  lsof -i / ps / pkill / kill           完整支持
 */

import os from 'node:os';
import { exec } from '../util/exec.js';

/** @typedef {'win32'|'linux'|'darwin'|'unsupported'} Platform */

/** @returns {Platform} */
export function currentPlatform() {
  const p = process.platform;
  if (p === 'win32' || p === 'linux' || p === 'darwin') return p;
  return 'unsupported';
}

export const IS_WINDOWS = process.platform === 'win32';

/* ============================================================
   端口 → PID
   ============================================================ */

/**
 * 从 netstat -ano（Windows）输出解析监听某端口的 PID。
 *
 * 导出为纯函数以便脱离平台单测——解析逻辑正是最容易出错的部分。
 *
 * @param {string} output
 * @param {number} port
 * @returns {number[]}
 */
export function parseNetstatPids(output, port) {
  if (!output) return [];
  // 端口必须紧跟空白或行尾，否则 :8090 会误命中 :80901 / :18090
  const re = new RegExp(
    `^\\s*(?:TCP|TCP6)\\s+\\S+:${port}(?:\\s|$)\\S*\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`,
    'gim',
  );
  const pids = new Set();
  for (const m of output.matchAll(re)) {
    const pid = Number.parseInt(m[1], 10);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids].sort((a, b) => a - b);
}

/**
 * 从 ss -ltnp（Linux）输出解析监听某端口的 PID。
 *
 * 形如：
 *   LISTEN 0  128  0.0.0.0:3000  0.0.0.0:*  users:(("node",pid=32268,fd=20))
 * 同一端口可能挂多个进程，全部取出。
 *
 * @param {string} output
 * @param {number} port
 * @returns {number[]}
 */
export function parseSsPids(output, port) {
  if (!output) return [];
  const pids = new Set();
  // 按行找包含 :port 的行，再从中抽所有 pid=
  const portRe = new RegExp(`[:.]${port}\\s`);
  for (const line of output.split('\n')) {
    if (!portRe.test(line)) continue;
    for (const m of line.matchAll(/pid=(\d+)/g)) {
      const pid = Number.parseInt(m[1], 10);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  }
  return [...pids].sort((a, b) => a - b);
}

/**
 * 从 lsof -iTCP:PORT -sTCP:LISTEN（macOS）输出解析 PID。
 *
 * 形如：
 *   COMMAND PID  USER   FD   TYPE  DEVICE  NODE  NAME
 *   node    32268 user   20u  IPv4  ...     TCP *:3000 (LISTEN)
 *
 * @param {string} output
 * @param {number} port
 * @returns {number[]}
 */
export function parseLsofPids(output) {
  if (!output) return [];
  const pids = new Set();

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // -t 模式：整行就是一个 PID
    if (/^\d+$/.test(trimmed)) {
      const pid = Number.parseInt(trimmed, 10);
      if (pid > 0) pids.add(pid);
      continue;
    }

    // 表格模式：跳过表头，取第二列
    const cells = trimmed.split(/\s+/);
    if (cells.length < 2) continue;
    if (/^pid$/i.test(cells[1])) continue;
    const pid = Number.parseInt(cells[1], 10);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }

  return [...pids].sort((a, b) => a - b);
}

/**
 * 查询本机监听某端口的 PID（跨平台）。
 *
 * @param {number} port
 * @returns {Promise<number[]>}
 */
export async function pidsOnPort(port) {
  const platform = currentPlatform();

  if (platform === 'win32') {
    const r = await exec('netstat', ['-ano']);
    return r.ok ? parseNetstatPids(r.stdout, port) : [];
  }

  if (platform === 'linux') {
    const r = await exec('ss', ['-ltnp']);
    // ss 拿不到（老版本内核或未装 iproute2）时退到 lsof
    if (r.ok) {
      const pids = parseSsPids(r.stdout, port);
      if (pids.length > 0) return pids;
    }
    const l = await exec('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-t']);
    return l.ok ? parseLsofPids(l.stdout) : [];
  }

  if (platform === 'darwin') {
    const l = await exec('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-t']);
    return l.ok ? parseLsofPids(l.stdout) : [];
  }

  return [];
}

/**
 * 查询多个端口上监听的 PID 并集。
 *
 * @param {number[]} ports
 * @returns {Promise<number[]>}
 */
export async function pidsOnPorts(ports) {
  const all = new Set();
  for (const port of ports) {
    for (const pid of await pidsOnPort(port)) all.add(pid);
  }
  return [...all].sort((a, b) => a - b);
}

/* ============================================================
   进程名 → PID
   ============================================================ */

/**
 * 按镜像名查 PID（跨平台）。
 *
 * Windows: tasklist /fi "imagename eq X.exe" /nh /fo csv
 * POSIX:   ps -Ao pid=,comm= 后本地过滤（pgrep 输出不含完整路径，兼容性差）
 *
 * @param {string} imageName 例如 "wb2api.exe" 或 "node"
 * @returns {Promise<number[]>}
 */
export async function pidsByImageName(imageName) {
  const platform = currentPlatform();
  const target = imageName.toLowerCase();
  // Windows 的 tasklist 用 imagename eq，区分大小写不敏感；这里统一小写比较
  const bare = target.replace(/\.exe$/, '');

  if (platform === 'win32') {
    const r = await exec('tasklist', ['/fi', `imagename eq ${imageName}`, '/nh', '/fo', 'csv']);
    if (!r.ok) return [];
    const pids = [];
    for (const line of r.stdout.split(/\r?\n/)) {
      const cells = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1));
      if (!cells || cells.length < 2) continue;
      if (cells[0]?.toLowerCase() !== target) continue;
      const pid = Number.parseInt(cells[1], 10);
      if (Number.isInteger(pid) && pid > 0) pids.push(pid);
    }
    return [...new Set(pids)].sort((a, b) => a - b);
  }

  // POSIX：ps -Ao pid=,comm= 输出 "PID COMMAND"
  const r = await exec('ps', ['-Ao', 'pid=,comm=']);
  if (!r.ok) return [];
  const pids = [];
  for (const line of r.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const pid = Number.parseInt(m[1], 10);
    const name = m[2].trim().toLowerCase();
    // comm 可能是 "node" 或 "wb2api"，做包含匹配以兼容路径形式
    if (name === bare || name.includes(bare)) {
      if (Number.isInteger(pid) && pid > 0) pids.push(pid);
    }
  }
  return [...new Set(pids)].sort((a, b) => a - b);
}

/**
 * 查 PID 对应的进程名（用于错误提示"端口被谁占了"）。
 *
 * @param {number} pid
 * @returns {Promise<string|null>}
 */
export async function imageNameOfPid(pid) {
  const platform = currentPlatform();

  if (platform === 'win32') {
    const r = await exec('tasklist', ['/fi', `pid eq ${pid}`, '/nh', '/fo', 'csv']);
    if (!r.ok) return null;
    for (const line of r.stdout.split(/\r?\n/)) {
      const cells = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1));
      if (cells?.[0] && Number.parseInt(cells[1], 10) === pid) return cells[0];
    }
    return null;
  }

  const r = await exec('ps', ['-o', 'comm=', '-p', String(pid)]);
  return r.ok ? r.stdout.trim() || null : null;
}

/* ============================================================
   进程终止
   ============================================================ */

/**
 * 结束一个进程。
 *
 * force=false 时先软杀（Windows 的 taskkill 无 /F 等同 WM_CLOSE；
 * POSIX 发 SIGTERM），给程序自己清理状态文件的机会。
 * force=true 时强杀（Windows /F；POSIX SIGKILL）。
 *
 * @param {number} pid
 * @param {boolean} force
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function killPid(pid, force) {
  const platform = currentPlatform();

  if (platform === 'win32') {
    const args = force ? ['/F', '/PID', String(pid)] : ['/PID', String(pid)];
    const r = await exec('taskkill', args, { timeoutMs: 10000 });
    // 进程已退出时 taskkill 返回非 0，属正常
    if (!r.ok && /not found|不存在|没有找到/i.test(`${r.stdout}${r.stderr}`)) {
      return { ok: true, error: null };
    }
    return { ok: r.ok, error: r.ok ? null : (r.stderr || r.stdout) };
  }

  const r = await exec('kill', [force ? '-9' : '-15', String(pid)], { timeoutMs: 10000 });
  if (!r.ok && /no such process/i.test(r.stderr)) {
    return { ok: true, error: null };
  }
  return { ok: r.ok, error: r.ok ? null : r.stderr };
}

/**
 * 结束一批进程。
 *
 * @param {number[]} pids
 * @param {boolean} force
 * @returns {Promise<void>}
 */
export async function killPids(pids, force) {
  for (const pid of pids) {
    await killPid(pid, force);
  }
}

/* ============================================================
   脚本执行
   ============================================================ */

/**
 * 平台相关的启动命令包装。
 *
 * Windows 的 .bat/.cmd 必须经 cmd.exe /c；POSIX 的 .sh 直接用 bash。
 * 这样 registry 里可以统一写脚本名，不必为每个平台各写一条。
 *
 * @param {string} script 脚本文件名，如 "start.bat" 或 "start.sh"
 * @returns {{ command: string, args: string[] }}
 */
export function wrapScript(script) {
  if (IS_WINDOWS) {
    return { command: 'cmd.exe', args: ['/c', script] };
  }
  return { command: 'bash', args: [script] };
}

/**
 * 打开一个 URL（跨平台）。
 *
 * @param {string} url
 * @returns {Promise<{ ok: boolean }>}
 */
export async function openUrl(url) {
  const platform = currentPlatform();
  const map = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
  };
  const cmd = map[platform];
  if (!cmd) return { ok: false };
  const r = await exec(cmd[0], cmd[1], { timeoutMs: 10000 });
  return { ok: r.ok };
}

/** 供错误提示用：当前平台名 */
export function platformLabel() {
  return `${os.platform()} ${os.arch()}`;
}
