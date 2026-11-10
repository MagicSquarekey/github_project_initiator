/**
 * GitHub Release 更新所需的纯函数：下载、校验、解压后的覆盖/回滚。
 *
 * 这一层不碰进程启停，也不读 registry；由 core/update.js 编排。
 * 网络请求优先走 Node 自带 fetch，直连被阻断时自动重试并兜底走系统代理
 * （curl.exe，系统自带，不引第三方依赖）。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractZip } from './zip.js';
import { exec } from '../util/exec.js';
import { logger } from '../util/logger.js';

/**
 * 把简单的 glob 转成正则：* 不跨目录，** 跨目录，? 单字符。
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${re}$`, 'i');
}

/**
 * 资产名匹配（如 *-windows-amd64.zip）。
 *
 * @param {string} pattern
 * @param {string} name
 * @returns {boolean}
 */
export function globMatch(pattern, name) {
  return globToRegExp(pattern).test(name);
}

/**
 * 判断相对路径是否命中保留列表。
 *
 * `accounts/**` 同时保护 accounts 目录本身及其下所有文件；
 * 否则遍历时仍会进入目录（虽然文件会被跳过），语义不直观。
 *
 * @param {string} rel
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function isPreserved(rel, patterns) {
  const p = rel.replace(/\\/g, '/');
  for (const raw of patterns ?? []) {
    const pattern = raw.replace(/\\/g, '/');
    if (pattern.endsWith('/**')) {
      const base = pattern.slice(0, -3);
      if (p === base || p.startsWith(`${base}/`)) return true;
    }
    if (globToRegExp(pattern).test(p)) return true;
  }
  return false;
}

/**
 * GitHub 访问的通道回退策略。
 *
 * 直连 api.github.com 在部分网络下间歇性被阻断，而 Node fetch 不读 Windows
 * 系统代理，一次失败就整个更新报废。所以按下面顺序依次尝试：
 *   1. 直连（Node fetch）——最快，且不依赖代理工具是否开着；
 *   2. 直连重试——吸收偶发的连接重置；
 *   3. 系统代理（curl.exe 显式 --proxy）——HKCU Internet Settings 里
 *      ProxyEnable=1 的那个（通常是 Clash 类工具）。
 * HTTP 状态码错误（403/404 等）换通道结果一样，不重试直接抛。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const WIN_INET_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

/** 读 Windows 系统代理，返回 http://host:port；未开启或非 Windows 返回 null。 */
async function systemProxy() {
  if (process.platform !== 'win32') return null;
  const enable = await exec('reg.exe', ['query', WIN_INET_KEY, '/v', 'ProxyEnable'], { timeoutMs: 5000 });
  if (!enable.ok || !/0x1\b/i.test(enable.stdout)) return null;
  const server = await exec('reg.exe', ['query', WIN_INET_KEY, '/v', 'ProxyServer'], { timeoutMs: 5000 });
  if (!server.ok) return null;
  const m = server.stdout.match(/ProxyServer\s+REG_SZ\s+(\S+)/);
  if (!m) return null;
  let value = m[1].trim();
  // "http=...;https=..." 按协议分开写时优先取 https
  if (value.includes('=')) {
    const perProto = Object.fromEntries(
      value
        .split(';')
        .map((pair) => pair.split('=', 2))
        .filter((pair) => pair.length === 2),
    );
    value = perProto.https || perProto.http || '';
  }
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

/**
 * 直连一次（Node fetch）。
 *
 * 网络层失败抛普通 Error（外层继续尝试）；HTTP 状态码错误挂上 httpStatus
 * 直接抛出。
 */
async function directOnce(url, { headers, timeoutMs, parseJson, destFile }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!res.ok) {
      const hint = parseJson && res.status === 403 ? '（可能触发 GitHub 限流，可设置 GITHUB_TOKEN）' : '';
      const err = new Error(`HTTP ${res.status}${hint}`);
      err.httpStatus = res.status;
      throw err;
    }
    if (destFile) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.writeFileSync(destFile, buf);
      return buf.length;
    }
    return await res.json();
  } catch (err) {
    if (err.httpStatus) throw err;
    if (err.name === 'AbortError') throw new Error(`连接超时（${timeoutMs}ms）`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 用 curl.exe 走一次（可带 --proxy），直连被阻断时的兜底通道。 */
async function curlOnce(url, { headers = {}, timeoutMs, proxy, destFile }) {
  const args = ['-sS', '--fail', '-L', '--connect-timeout', '15', '--max-time', String(Math.ceil(timeoutMs / 1000))];
  if (proxy) args.push('--proxy', proxy);
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`);
  if (destFile) args.push('-o', destFile);
  args.push(url);

  const r = await exec('curl.exe', args, { timeoutMs: timeoutMs + 10000 });
  if (!r.ok) {
    const detail =
      (r.stderr || r.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .pop() || (r.error || `curl 退出码 ${r.code ?? '?'}`);
    const err = new Error(detail);
    const status = detail.match(/returned error: (\d{3})/);
    if (status) err.httpStatus = Number(status[1]);
    throw err;
  }
  if (destFile) return fs.statSync(destFile).size;
  return r.stdout;
}

/**
 * 带通道回退的 GitHub 请求：直连两次后走系统代理，全部失败才抛。
 *
 * @param {string} url
 * @param {{ timeoutMs: number, headers?: Record<string, string>, parseJson?: boolean, destFile?: string, label?: string }} opts
 * @returns {Promise<any>} parseJson 时为解析后的 JSON；destFile 时为字节数；否则为响应文本
 */
async function githubRequest(url, { timeoutMs, headers = {}, parseJson = false, destFile = null, label = '网络请求' }) {
  const proxy = await systemProxy();
  const attempts = [{ kind: 'direct' }, { kind: 'direct', delayMs: 2000 }];
  if (proxy) attempts.push({ kind: 'curl', proxy });

  let lastErr = null;
  for (const attempt of attempts) {
    if (attempt.delayMs) await sleep(attempt.delayMs);
    try {
      if (attempt.kind === 'direct') {
        return await directOnce(url, { headers, timeoutMs, parseJson, destFile });
      }
      const out = await curlOnce(url, { headers, timeoutMs, proxy: attempt.proxy, destFile });
      return parseJson ? JSON.parse(out) : out;
    } catch (err) {
      lastErr = err;
      if (err.httpStatus) throw err;
      logger.warn(`${label}，${attempt.kind} 通道不可达，尝试下一通道`, { url, error: err.message });
    }
  }
  throw new Error(`${label}：${lastErr?.message ?? '未知错误'}（直连与系统代理均不可达）`);
}

/**
 * 取 GitHub 最新 release。
 *
 * @param {string} repo owner/name
 * @param {number} [timeoutMs]
 * @returns {Promise<any>}
 */
export async function fetchLatestRelease(repo, timeoutMs = 30000) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'github_project_initiator',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  return githubRequest(`https://api.github.com/repos/${repo}/releases/latest`, {
    timeoutMs,
    headers,
    parseJson: true,
    label: '查询最新 Release',
  });
}

/**
 * 下载文件到本地。
 *
 * @param {string} url
 * @param {string} dest
 * @param {number} [timeoutMs]
 * @returns {Promise<number>} 字节数
 */
export async function downloadFile(url, dest, timeoutMs = 300000) {
  return githubRequest(url, {
    timeoutMs,
    headers: { 'User-Agent': 'github_project_initiator' },
    destFile: dest,
    label: '下载',
  });
}

/**
 * 用 checksums.txt 校验下载的资产。
 *
 * @param {string} file
 * @param {string} checksumsText
 * @param {string} assetName
 */
export function verifyChecksum(file, checksumsText, assetName) {
  const line = checksumsText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => {
      const m = l.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
      return m && m[2].trim() === assetName;
    });

  if (!line) throw new Error(`checksums 中没有 ${assetName}`);
  const expected = line.match(/^([0-9a-f]{64})/i)[1].toLowerCase();
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) {
    throw new Error(`校验失败：期望 ${expected}，实际 ${actual}`);
  }
}

/**
 * 解压后按 stripComponents 进入真正的根目录。
 *
 * GitHub 的源码 zipball 顶层固定是 `<repo>-<tag>/`；release 资产 zip 有时也带一层。
 *
 * @param {string} extractDir
 * @param {number} strip
 * @returns {string}
 */
export function contentRoot(extractDir, strip = 0) {
  let dir = extractDir;
  for (let i = 0; i < strip; i++) {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.name !== '__MACOSX');
    if (entries.length !== 1 || !entries[0].isDirectory()) break;
    dir = path.join(dir, entries[0].name);
  }
  return dir;
}

/**
 * 在目录里递归找目标文件（二进制更新用）。
 *
 * @param {string} root
 * @param {string} name
 * @returns {string|null}
 */
export function findFile(root, name) {
  const wanted = name.toLowerCase();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === '__MACOSX') continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile() && entry.name.toLowerCase() === wanted) return p;
    }
  }
  return null;
}

/**
 * 覆盖式更新：把 srcDir 的文件复制到 destDir，保留 preserve 命中的路径。
 *
 * 覆盖前把原文件备份到 backupDir（镜像相对路径），并记录新建文件，
 * 失败时 restoreBackup() 可以完整回滚。
 *
 * @param {string} srcDir
 * @param {string} destDir
 * @param {string[]} preserve
 * @param {string} backupDir
 * @returns {{ overwritten: string[], created: string[] }}
 */
export function applyOverlay(srcDir, destDir, preserve, backupDir) {
  const overwritten = [];
  const created = [];

  const walk = (dir, relBase) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__MACOSX' || entry.name === '.git') continue;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (isPreserved(rel, preserve)) continue;

      const src = path.join(dir, entry.name);
      const dest = path.join(destDir, rel);

      if (entry.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        walk(src, rel);
        continue;
      }
      if (!entry.isFile()) continue;

      if (fs.existsSync(dest)) {
        const backup = path.join(backupDir, rel);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(dest, backup);
        overwritten.push(rel);
      } else {
        created.push(rel);
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  };

  walk(srcDir, '');
  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    `${JSON.stringify({ mode: 'overlay', overwritten, created }, null, 2)}\n`,
    'utf8',
  );
  return { overwritten, created };
}

/**
 * 二进制替换：备份旧文件后写入新文件。
 *
 * @param {string} newFile
 * @param {string} destFile
 * @param {string} backupDir
 * @param {string} relTarget
 */
export function replaceBinary(newFile, destFile, backupDir, relTarget) {
  const existed = fs.existsSync(destFile);
  if (existed) {
    const backup = path.join(backupDir, relTarget);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(destFile, backup);
  }
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.copyFileSync(newFile, destFile);
  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    `${JSON.stringify({ mode: 'binary', target: relTarget, existed }, null, 2)}\n`,
    'utf8',
  );
  return { existed };
}

/**
 * 按备份目录里的 manifest 回滚。
 *
 * @param {string} destDir
 * @param {string} backupDir
 */
export function restoreBackup(destDir, backupDir) {
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (manifest.mode === 'binary') {
    if (manifest.existed) {
      const backup = path.join(backupDir, manifest.target);
      const dest = path.join(destDir, manifest.target);
      if (fs.existsSync(backup)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(backup, dest);
      }
    }
    return;
  }

  for (const rel of manifest.overwritten ?? []) {
    const backup = path.join(backupDir, rel);
    const dest = path.join(destDir, rel);
    if (fs.existsSync(backup)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(backup, dest);
    }
  }
  for (const rel of manifest.created ?? []) {
    try {
      fs.unlinkSync(path.join(destDir, rel));
    } catch {
      // 已经被删/被改都无所谓，回滚是尽力而为
    }
  }
}

export { extractZip };
