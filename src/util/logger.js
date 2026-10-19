/**
 * 极简日志：同时写控制台和 data/logs/manager.log。
 *
 * 不引 pino/winston：这个项目的日志量很小（几个动作几条记录），
 * 而且日志文件要能被人直接打开看，纯文本反而更友好。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(ROOT, 'data', 'logs');
const MANAGER_LOG = path.join(LOG_DIR, 'manager.log');

/** 单文件超过 8MB 轮转到 .1，避免无限增长 */
const MAX_BYTES = 8 * 1024 * 1024;

let stream = null;

function ensureStream() {
  if (stream) return stream;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  try {
    if (fs.existsSync(MANAGER_LOG) && fs.statSync(MANAGER_LOG).size > MAX_BYTES) {
      fs.renameSync(MANAGER_LOG, `${MANAGER_LOG}.1`);
    }
  } catch {
    // 轮转失败不阻塞日志写入
  }
  stream = fs.createWriteStream(MANAGER_LOG, { flags: 'a' });
  return stream;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {unknown} [detail]
 */
function write(level, message, detail) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}${
    detail === undefined ? '' : ` ${safeJson(detail)}`
  }\n`;

  // 控制台用不带时间戳的简版，读起来省眼
  const consoleLine = `[${level.toUpperCase()}] ${message}${
    detail === undefined ? '' : ` ${safeJson(detail)}`
  }`;
  if (level === 'error') console.error(consoleLine);
  else if (level === 'warn') console.warn(consoleLine);
  else console.log(consoleLine);

  try {
    ensureStream().write(line);
  } catch {
    // 磁盘满等场景下日志写不进去不能拖垮服务
  }
}

function safeJson(v) {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = {
  debug: (m, d) => write('debug', m, d),
  info: (m, d) => write('info', m, d),
  warn: (m, d) => write('warn', m, d),
  error: (m, d) => write('error', m, d),
};

/**
 * 为某个项目创建独立的日志文件写入器。
 * 每个被管项目的 stdout/stderr 都落到 data/logs/<id>.log。
 *
 * @param {string} projectId
 * @returns {{ write: (line: string) => void, path: string }}
 */
export function createProjectLogger(projectId) {
  const file = path.join(LOG_DIR, `${projectId}.log`);
  let s = null;

  function ensure() {
    if (s) return s;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
        fs.renameSync(file, `${file}.1`);
      }
    } catch {
      /* 轮转失败不阻塞 */
    }
    s = fs.createWriteStream(file, { flags: 'a' });
    return s;
  }

  return {
    path: file,
    write(line) {
      const stamped = `[${new Date().toISOString()}] ${line}\n`;
      try {
        ensure().write(stamped);
      } catch {
        /* 同上 */
      }
    },
  };
}

/**
 * 读取某个项目日志的最后 N 行。
 *
 * @param {string} projectId
 * @param {number} [lines]
 * @returns {string[]}
 */
export function readProjectLog(projectId, lines = 200) {
  const file = path.join(LOG_DIR, `${projectId}.log`);
  try {
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, 'utf8');
    const all = content.split(/\r?\n/).filter((l) => l.length > 0);
    return all.slice(-lines);
  } catch {
    return [];
  }
}

export { ROOT as LOG_ROOT };
