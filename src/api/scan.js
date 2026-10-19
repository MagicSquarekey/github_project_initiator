/**
 * 目录扫描：发现 Desktop 下尚未纳入管理的项目。
 *
 * 只返回候选，不自动写入 registry——避免把临时目录、实验代码误纳管。
 * 由用户确认后再加入。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadRegistry } from '../core/registry.js';

/** 识别项目的特征文件 */
const MARKERS = [
  { file: 'package.json', kind: 'node-service', label: 'Node 项目' },
  { file: 'pyproject.toml', kind: 'python-service', label: 'Python 项目' },
  { file: 'requirements.txt', kind: 'python-service', label: 'Python 项目' },
  { file: 'project.godot', kind: 'desktop-app', label: 'Godot 工程' },
];

/** 扫描时跳过的目录 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'AppData',
  'Application Data',
]);

/**
 * 扫描指定根目录，返回候选项目列表。
 *
 * @param {string} [root]
 * @param {number} [maxDepth]
 * @returns {Promise<{ root: string, candidates: any[] }>}
 */
export async function scanForProjects(root, maxDepth = 2) {
  const scanRoot = root ?? path.join(os.homedir(), 'Desktop');
  const candidates = [];

  if (!fs.existsSync(scanRoot)) {
    return { root: scanRoot, candidates, error: '目录不存在' };
  }

  await walk(scanRoot, 0, maxDepth, candidates);

  // 按名称排序，输出稳定
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return { root: scanRoot, candidates };
}

async function walk(dir, depth, maxDepth, out) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 无权限等
  }

  // 先看当前目录是不是项目
  const marker = MARKERS.find((m) => entries.some((e) => e.isFile() && e.name === m.file));
  const hasGit = fs.existsSync(path.join(dir, '.git'));

  if (marker || hasGit) {
    const isRepo = fs.existsSync(path.join(dir, '.git'));
    out.push({
      name: path.basename(dir),
      path: dir,
      kind: marker?.kind ?? 'unknown',
      kindLabel: marker?.label ?? (isRepo ? 'Git 仓库' : '未知'),
      isRepo,
      depth,
    });
    // 是项目就不再往下钻（避免把项目里的子目录也当项目）
    if (depth > 0) return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    await walk(path.join(dir, entry.name), depth + 1, maxDepth, out);
  }
}

/**
 * 判断一个目录是否已被 registry 管理。
 *
 * @param {string} dir
 * @returns {boolean}
 */
export function isManaged(dir) {
  try {
    const { projects } = loadRegistry();
    const normalized = path.resolve(dir).toLowerCase();
    return projects.some((p) => path.resolve(p.path).toLowerCase() === normalized);
  } catch {
    return false;
  }
}
