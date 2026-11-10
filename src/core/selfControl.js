/**
 * 管理器自身的重启编排。
 *
 * 运行方式不同，重启路径也不同：
 *   - systemd（有 INVOCATION_ID）：以非 0 退出，交给 unit 的 Restart=on-failure；
 *     exit 0 会被 systemd 当成"正常停止"，不会拉起，所以不能走优雅退出。
 *   - 其他（Windows 自启 VBS / 手动 node）：派生一个脱离的 helper，
 *     等旧进程退出、端口释放后再拉起同一份代码，并做健康检查。
 *
 * 只重启管理器自己，绝不碰被管项目：helper 只 spawn src/index.js。
 */

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MANAGER_PORT } from './registry.js';
import { logger } from '../util/logger.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HELPER = path.join(ROOT, 'scripts', 'self-restart.mjs');
const LOG_DIR = path.join(ROOT, 'data', 'logs');
const SELF_LOG = path.join(LOG_DIR, 'self-restart.log');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 当前进程实际监听的端口（canary 会用 GPI_PORT 覆盖） */
export function selfPort() {
  return Number(process.env.GPI_PORT) || MANAGER_PORT;
}

/** 是否由 systemd 监管（systemd 会为每个 unit 设置 INVOCATION_ID） */
export function isUnderSystemd() {
  return Boolean(process.env.INVOCATION_ID);
}

/** 日志时间戳：本地时间 + 显式偏移，和 manager.log 的格式保持一致 */
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

/** 同步追加一行到 self-restart.log：进程可能马上退出，不能用异步写流 */
export function appendSelfLog(line) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(SELF_LOG, `[${stamp()}] ${line}\n`);
  } catch {
    // 日志写不了不影响重启本身
  }
}

/** 让系统分配一个空闲端口（bind 0 拿到后立刻释放） */
export function pickFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, host, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** 请求一次 /api/health；失败/超时返回 null */
function healthOnce(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/api/health', timeout: timeoutMs }, (res) => {
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

/**
 * 轮询 /api/health 直到 ok 或超时。
 *
 * GPI_HOST 可能是具体网卡地址（甚至逗号分隔的多个），逐个试，回环兜底。
 *
 * @returns {Promise<any|null>}
 */
export async function waitForHealth(port, timeoutMs = 10000, env = process.env) {
  const raw = String(env.GPI_HOST || '127.0.0.1');
  const hosts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((h) => (h === '0.0.0.0' || h === '::' ? '127.0.0.1' : h));
  if (!hosts.includes('127.0.0.1')) hosts.push('127.0.0.1');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const host of new Set(hosts)) {
      const data = await healthOnce(port, host);
      if (data?.ok) return data;
    }
    await sleep(250);
  }
  return null;
}

/** 取输出里有信息量的几行，用来回报自检失败原因（别把整段栈塞进 toast） */
function tail(text, max = 500) {
  const s = String(text || '').replace(/\r/g, '').trim();
  if (!s) return '';
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const picked = lines.filter((l) => /error|err_|cannot|failed|exception|失败/i.test(l)).slice(-3);
  const out = picked.length ? picked.join(' | ') : lines.slice(-4).join(' | ');
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

/**
 * 更新后的自检：在随机端口用同一份代码起一个临时实例，能通过 /api/health 才算可用。
 *
 * 只看得到"能启动"，看不到功能是否正确——但足以挡住语法错误、导入失败、
 * 注册表校验失败这类会让看板彻底起不来的更新。
 *
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, detail?: string, port?: number }>}
 */
export async function preflightNewCode({ timeoutMs = 12000 } = {}) {
  const port = await pickFreePort();
  const logFile = `canary-${port}.log`;
  let output = '';

  let child;
  try {
    child = spawn(process.execPath, ['src/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        GPI_HOST: '127.0.0.1',
        GPI_PORT: String(port),
        GPI_LOG_FILE: logFile,
        GPI_SKIP_FETCH: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (err) {
    return { ok: false, detail: `无法启动自检进程：${err.message}` };
  }

  const collect = (buf) => {
    output += buf.toString();
    if (output.length > 8000) output = output.slice(-8000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  let exited = false;
  child.once('exit', () => { exited = true; });

  const health = await waitForHealth(port, timeoutMs);

  if (!exited) {
    try { child.kill('SIGTERM'); } catch { /* 已退出 */ }
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
    }, 2000).unref();
  }

  try {
    fs.unlinkSync(path.join(LOG_DIR, logFile));
  } catch {
    // 自检日志清理失败无所谓
  }

  if (health) {
    logger.info('自检通过：新代码能正常启动', { port, version: health.version });
    return { ok: true, port };
  }
  logger.warn('自检失败：新代码没能启动', { port, detail: tail(output, 300) });
  return { ok: false, port, detail: tail(output) };
}

/**
 * 安排一次自重启：先返回，延迟一小段时间后退出。
 *
 * @param {{ reason?: string }} [options]
 * @returns {Promise<{ ok: boolean, mode?: 'systemd'|'helper', helperPid?: number, message?: string }>}
 */
export async function scheduleSelfRestart({ reason = 'dashboard' } = {}) {
  const port = selfPort();
  const systemd = isUnderSystemd();
  logger.info('收到自重启请求', { reason, pid: process.pid, supervisor: systemd ? 'systemd' : 'helper' });

  if (systemd) {
    appendSelfLog(`restart requested (${reason}); pid=${process.pid}; exiting 1 for systemd Restart=on-failure`);
    // systemd 只认非 0 退出；这里不能走 SIGTERM/exit 0
    setTimeout(() => process.exit(1), 400).unref();
    return { ok: true, mode: 'systemd' };
  }

  let child;
  try {
    child = spawn(
      process.execPath,
      [HELPER, '--pid', String(process.pid), '--root', ROOT, '--port', String(port), '--reason', reason],
      {
        cwd: ROOT,
        env: process.env,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    child.unref();
  } catch (err) {
    logger.error('自重启失败：无法派生重启助手', { error: err.message });
    return { ok: false, message: `无法启动重启助手：${err.message}` };
  }

  // 助手如果立刻退出，多半是脚本本身有问题——这时不能把自己也退掉
  const alive = await new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(true), 500);
    child.once('exit', () => { clearTimeout(timer); done(false); });
    child.once('error', () => { clearTimeout(timer); done(false); });
    timer.unref?.();
  });

  if (!alive) {
    logger.error('自重启失败：重启助手启动后立即退出');
    return { ok: false, message: '重启助手启动失败，已取消重启（管理器继续运行）' };
  }

  logger.info('管理器即将退出，交给重启助手拉起新进程', { helperPid: child.pid, port });
  setTimeout(() => process.exit(0), 400).unref();
  return { ok: true, mode: 'helper', helperPid: child.pid };
}
