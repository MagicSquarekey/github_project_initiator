#!/usr/bin/env node
/**
 * 自重启助手：等旧的管理器进程退出、端口释放后，用同一个 node 拉起 src/index.js。
 *
 * 为什么需要它：Windows 上管理器只有登录自启（HKCU Run），没有守护进程。
 * 管理者要重启自己时不能"先退出再指望有人拉起"，只能先派生一个脱离的助手，
 * 由助手在旧进程彻底退出后启动新进程，并做健康检查。
 *
 * 只负责管理器自己，绝不碰被管项目。
 *
 * 参数：--pid <旧进程> --root <项目根> --port <端口> [--reason <原因>]
 * 结果追加到 data/logs/self-restart.log（同步写，进程随时可能退出）。
 */

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

const oldPid = Number(arg('pid'));
const root = arg('root') || process.cwd();
const port = Number(arg('port')) || 8780;
const reason = arg('reason') || 'restart';
const logFile = path.join(root, 'data', 'logs', 'self-restart.log');

/** 本地时间 + 显式偏移，和 manager.log 的格式保持一致 */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')} `
    + `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

function log(line) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  } catch {
    // ignore
  }
  try {
    fs.appendFileSync(logFile, `[${stamp()}] ${line}\n`);
  } catch {
    // 日志写不了不影响拉起
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 端口上有没有人在听（connect 成功即有人） */
function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(500);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

function healthOnce(host, p) {
  return new Promise((resolve) => {
    const req = http.get({ host, port: p, path: '/api/health', timeout: 800 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 ? JSON.parse(body) : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

/** GPI_HOST 可能是具体网卡地址（或逗号分隔），逐个试，回环兜底 */
function healthHosts() {
  const raw = String(process.env.GPI_HOST || '127.0.0.1');
  const hosts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((h) => (h === '0.0.0.0' || h === '::' ? '127.0.0.1' : h));
  if (!hosts.includes('127.0.0.1')) hosts.push('127.0.0.1');
  return [...new Set(hosts)];
}

async function waitHealthy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const host of healthHosts()) {
      const data = await healthOnce(host, port);
      if (data?.ok) return { host, data };
    }
    await sleep(500);
  }
  return null;
}

async function main() {
  log(`helper start: reason=${reason} old pid=${oldPid} port=${port} root=${root}`);

  // 1. 等旧进程退出（最多 15 秒）
  for (let i = 0; i < 150 && pidAlive(oldPid); i++) await sleep(100);
  if (pidAlive(oldPid)) {
    log(`abort: old process ${oldPid} still alive after 15s`);
    process.exit(1);
  }

  // 2. 等端口释放（最多 10 秒）
  for (let i = 0; i < 100 && await portInUse(port); i++) await sleep(100);
  if (await portInUse(port)) log('warn: port still in use, starting anyway');

  // 3. 拉起新进程：同一个 node 二进制、同一 cwd/env（去掉 canary 专用变量）
  const env = { ...process.env };
  delete env.GPI_LOG_FILE;
  delete env.GPI_SKIP_FETCH;

  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  log(`spawned new manager pid=${child.pid}`);

  // 4. 健康检查：30 秒 × 2 次
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ok = await waitHealthy(30000);
    if (ok) {
      log(`health ok via ${ok.host}:${port} version=${ok.data.version} uptime=${ok.data.uptimeSec}s`);
      process.exit(0);
    }
    log(`attempt ${attempt}: health check failed`);
  }

  log('FAILED: manager did not become healthy; see data/logs/manager.log');
  process.exit(1);
}

main().catch((err) => {
  log(`crashed: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
