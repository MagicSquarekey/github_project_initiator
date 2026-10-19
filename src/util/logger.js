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
 * 日志时区：北京时间，带显式 UTC 偏移。
 *
 * 之前用 toISOString() 输出 UTC（03:40Z），而实际是上午 11:40，
 * 排查问题时每次都要心算 +8，跨天判断还容易错。
 * 现在输出 "2026-10-19 11:40:23.782 +08:00"：既直观又无歧义。
 *
 * 用 Intl 按 Asia/Shanghai 取分量，不依赖机器时区——即使部署到 UTC 服务器，
 * 日志时间也保持一致。需要别的时区时用 GPI_LOG_TZ 覆盖。
 */
const LOG_TIMEZONE = process.env.GPI_LOG_TZ || 'Asia/Shanghai';

const pad = (n, width = 2) => String(n).padStart(width, '0');

/**
 * 计算某时刻在目标时区相对 UTC 的偏移（分钟）。自动处理夏令时。
 *
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number}
 */
function tzOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;

  // 把目标时区的"墙上时间"当作 UTC 解析，再与实际时刻相减，得到偏移
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,   // 某些 ICU 在 hour12=false 下会用 24 表示午夜
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

/**
 * 生成日志时间戳。
 *
 * @param {Date} [date]
 * @returns {string} 形如 "2026-10-19 11:40:23.782 +08:00"
 */
export function formatLogTime(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOG_TIMEZONE,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;

  const offset = tzOffsetMinutes(date, LOG_TIMEZONE);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);

  return (
    `${parts.year}-${parts.month}-${parts.day} ` +
    `${pad(Number(parts.hour) % 24)}:${parts.minute}:${parts.second}.${pad(date.getMilliseconds(), 3)} ` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/**
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {unknown} [detail]
 */
function write(level, message, detail) {
  const line = `[${formatLogTime()}] ${level.toUpperCase().padEnd(5)} ${message}${
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
      const stamped = `[${formatLogTime()}] ${line}\n`;
      try {
        ensure().write(stamped);
      } catch {
        /* 同上 */
      }
    },
  };
}

/**
 * 把历史日志里的 UTC 时间戳前缀统一成北京时间。
 *
 * 1.1.0 之前的日志用 toISOString() 写出（UTC，以 Z 结尾），之后的版本
 * 已直接写北京时间。同一个日志文件会同时存在两种格式，读取时统一转换，
 * 避免面板里混排两个时区。
 *
 * 只改展示，不改磁盘上的原始记录——历史就是历史，不该被重写。
 *
 * @param {string} line
 * @returns {string}
 */
export function normalizeLegacyTimestamp(line) {
  const m = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
  if (!m) return line;
  const date = new Date(m[1]);
  if (Number.isNaN(date.getTime())) return line;
  return `[${formatLogTime(date)}]${line.slice(m[0].length)}`;
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
    return all.slice(-lines).map(normalizeLegacyTimestamp);
  } catch {
    return [];
  }
}

export { ROOT as LOG_ROOT };
