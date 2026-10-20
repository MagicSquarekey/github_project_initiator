/**
 * 目录浏览：给"添加项目"弹窗提供一个轻量的文件夹选择器。
 *
 * 浏览器无法把本地绝对路径交给网页（File System Access API 只给句柄），
 * 所以由本地管理器列出目录。服务只监听 127.0.0.1，且这里只返回目录名，
 * 不读取文件内容。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandPath } from '../core/registry.js';

/** 目录树里不展示的重目录/系统目录 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.turbo',
  '.cache',
  'AppData',
  'Application Data',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

/**
 * 常用位置快捷入口（只返回真实存在的）。
 *
 * @returns {{ label: string, path: string }[]}
 */
function shortcuts() {
  const home = os.homedir();
  const list = [
    { key: 'home', label: '主目录', path: home },
    { key: 'desktop', label: '桌面', path: path.join(home, 'Desktop') },
    { key: 'downloads', label: '下载', path: path.join(home, 'Downloads') },
    { key: 'documents', label: '文档', path: path.join(home, 'Documents') },
  ];
  return list.filter((s) => fs.existsSync(s.path));
}

/**
 * Windows 盘符列表；其他平台返回根目录。
 *
 * @returns {{ name: string, path: string, type: string }[]}
 */
function roots() {
  if (process.platform !== 'win32') {
    return [{ name: '/', path: '/', type: 'drive' }];
  }
  const drives = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    if (fs.existsSync(root)) {
      drives.push({ name: `${letter}:`, path: root, type: 'drive' });
    }
  }
  return drives;
}

/**
 * 列出某个目录下的子目录；不传路径时返回盘符/根目录。
 *
 * @param {string} [target]
 * @returns {any}
 */
export function browseDirectories(target) {
  const quick = shortcuts();

  if (!target || !String(target).trim()) {
    return { path: null, parent: null, entries: roots(), shortcuts: quick };
  }

  const abs = path.resolve(expandPath(String(target)));
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return { path: abs, parent: null, entries: [], shortcuts: quick, error: '目录不存在' };
  }
  if (!stat.isDirectory()) {
    return { path: abs, parent: null, entries: [], shortcuts: quick, error: '不是目录' };
  }

  let dirents;
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    return { path: abs, parent: null, entries: [], shortcuts: quick, error: `无法读取目录：${err.message}` };
  }

  const entries = dirents
    .filter((e) => e.isDirectory())
    .filter((e) => !e.name.startsWith('.'))
    .filter((e) => !SKIP_DIRS.has(e.name))
    .map((e) => ({ name: e.name, path: path.join(abs, e.name), type: 'dir' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(abs);
  return {
    path: abs,
    parent: parent === abs ? null : parent,
    entries,
    shortcuts: quick,
  };
}
