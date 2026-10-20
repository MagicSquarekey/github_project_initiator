/**
 * 目录扫描：发现根目录下尚未纳入管理的项目。
 *
 * 只返回候选，不自动写入 registry——避免把临时目录、实验代码误纳管。
 * 由用户在"添加项目"弹窗里确认后再加入。
 *
 * 识别逻辑复用 inspect.js：扫描和单目录识别必须给出一致的建议，
 * 否则用户点"使用"后表单会突然变成另一套值。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expandPath, loadRegistry } from '../core/registry.js';
import { inspectDirectory } from './inspect.js';

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
  '$RECYCLE.BIN',
  'System Volume Information',
]);

/**
 * 扫描指定根目录，返回候选项目列表。
 *
 * @param {string} [root]
 * @param {number} [maxDepth]
 * @param {{ registryProjects?: any[] }} [options]
 * @returns {Promise<{ root: string, candidates: any[] }>}
 */
export async function scanForProjects(root, maxDepth = 2, options = {}) {
  const scanRoot = root ? path.resolve(expandPath(String(root))) : path.join(os.homedir(), 'Desktop');
  const candidates = [];

  if (!fs.existsSync(scanRoot)) {
    return { root: scanRoot, candidates, error: '目录不存在' };
  }
  if (!fs.statSync(scanRoot).isDirectory()) {
    return { root: scanRoot, candidates, error: '不是目录' };
  }

  // 注册表只读一次：每个候选都 load 一次会把磁盘 IO 放大到项目数量倍
  let registryProjects = options.registryProjects;
  if (!Array.isArray(registryProjects)) {
    try {
      registryProjects = loadRegistry().projects;
    } catch {
      registryProjects = [];
    }
  }

  const found = [];
  await walk(scanRoot, 0, maxDepth, found);

  for (const { dir, depth } of found) {
    const info = inspectDirectory(dir, { registryProjects });
    if (!info.exists) continue;
    candidates.push({
      name: info.name,
      path: dir,
      kind: info.kind ?? 'unknown',
      kindLabel: info.kindLabel ?? '未知',
      isRepo: info.git,
      depth,
      managed: info.managed === true,
      start: info.start,
      startCandidates: info.startCandidates,
      port: info.port,
      update: info.update,
    });
  }

  // 按名称排序，输出稳定
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return { root: scanRoot, candidates };
}

/**
 * 深度优先遍历，收集"看起来像项目"的目录。
 *
 * 判定与 inspect 的特征文件保持一致：有 package.json / pyproject.toml /
 * project.godot / .git 等。是项目后不再向下钻，避免把项目子目录当独立项目。
 *
 * @param {string} dir
 * @param {number} depth
 * @param {number} maxDepth
 * @param {{ dir: string, depth: number }[]} out
 */
async function walk(dir, depth, maxDepth, out) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 无权限等
  }

  const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name.toLowerCase()));
  const dirs = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase()));

  const isProject =
    dirs.has('.git') ||
    ['package.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'manage.py', 'project.godot', 'pom.xml', 'build.gradle', 'go.mod', 'cargo.toml', 'config.json'].some(
      (name) => files.has(name),
    );

  if (isProject) {
    out.push({ dir, depth });
    // 根目录本身是项目时仍继续看下一层（用户可能扫描的是 Desktop 而非单个项目）
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
    const normalized = path.resolve(expandPath(dir)).toLowerCase();
    return projects.some((p) => path.resolve(expandPath(p.path)).toLowerCase() === normalized);
  } catch {
    return false;
  }
}
