/**
 * GitHub Release 更新所需的纯函数：下载、校验、解压后的覆盖/回滚。
 *
 * 这一层不碰进程启停，也不读 registry；由 core/update.js 编排。
 * 所有网络请求都走 Node 20+ 自带的 fetch，不引第三方依赖。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractZip } from './zip.js';

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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const hint = res.status === 403 ? '（可能触发 GitHub 限流，可设置 GITHUB_TOKEN）' : '';
      throw new Error(`查询最新 Release 失败：HTTP ${res.status}${hint}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'github_project_initiator' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`下载失败：HTTP ${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return buf.length;
  } finally {
    clearTimeout(timer);
  }
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
