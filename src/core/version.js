/**
 * 项目版本探测。
 *
 * 启动器不改动被管项目，所以版本只能"读"出来。按可靠性从高到低：
 *
 *   1. registry 里的静态 version（覆盖一切）
 *   2. versionCommand（pip 安装的服务，动态查询）
 *   3. 项目清单文件（package.json / pyproject.toml / Cargo.toml / project.godot / VERSION）
 *   4. monorepo 常见子目录清单（frontend/package.json 等）
 *   5. 根目录 Python 文件里的 VERSION / __version__
 *   6. Elasticsearch 发行版的 lib/elasticsearch-<x.y.z>.jar
 *   7. git describe --tags --always（无清单的 git 项目）
 *
 * 结果缓存 60 秒：看板每 3 秒轮询一次，不能让 Python/git 子进程每 3 秒起一次。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from '../util/exec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
/** 管理器自己记录的版本（release 更新成功后写入），优先于 registry 静态值 */
function statePath() {
  return process.env.GPI_VERSIONS_FILE || path.join(ROOT, 'data', 'versions.json');
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

/**
 * 读取小文本文件；不存在、非文件或过大都返回 null。
 *
 * @param {string} file
 * @param {number} [maxBytes]
 * @returns {string|null}
 */
function readText(file, maxBytes = 2 * 1024 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * @returns {Record<string, string>}
 */
function readStateVersions() {
  const raw = readText(statePath(), 256 * 1024);
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} file
 * @returns {string|null}
 */
function versionFromPackageJson(file) {
  const raw = readText(file);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw).version;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 只读指定 TOML section 里的 version，避免误读依赖版本。
 *
 * @param {string} file
 * @param {string} section 如 project / tool.poetry / package
 * @returns {string|null}
 */
function versionFromToml(file, section) {
  const raw = readText(file);
  if (!raw) return null;

  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const header = raw.match(new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, 'm'));
  if (!header) return null;

  const rest = raw.slice(header.index + header[0].length);
  const nextHeader = rest.search(/^\s*\[/m);
  const body = nextHeader === -1 ? rest : rest.slice(0, nextHeader);
  const m = body.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
  return m ? m[1].trim() : null;
}

/**
 * Godot 4 的 application/config/version；注意不要误读 config_version（工程格式版本）。
 *
 * @param {string} file
 * @returns {string|null}
 */
function versionFromGodot(file) {
  const raw = readText(file);
  if (!raw) return null;
  const m = raw.match(/^\s*(?:application\/config\/version|config\/version)\s*=\s*"([^"]+)"/m);
  return m ? m[1].trim() : null;
}

/**
 * @param {string} file
 * @returns {string|null}
 */
function versionFromVersionFile(file) {
  const raw = readText(file, 64 * 1024);
  if (!raw) return null;
  return raw.split(/\r?\n/).map((x) => x.trim()).find(Boolean) ?? null;
}

/**
 * release-please 的清单：{".": "6.7.0"}。
 *
 * @param {string} file
 * @returns {string|null}
 */
function versionFromReleasePlease(file) {
  const raw = readText(file);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const v = data['.'] ?? Object.values(data)[0];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 根目录 Python 文件里的 VERSION / __version__ 常量（如 qoder2api-hub）。
 *
 * @param {string} dir
 * @returns {string|null}
 */
function versionFromPython(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.py')) continue;
    const raw = readText(path.join(dir, entry.name), 512 * 1024);
    if (!raw) continue;
    const m = raw.match(/^\s*(?:__version__|VERSION)\s*=\s*["']([^"']+)["']/m);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * ES zip 发行版：lib/elasticsearch-<x.y.z>.jar。
 *
 * @param {string} dir
 * @returns {string|null}
 */
function versionFromElasticsearch(dir) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(dir, 'lib'));
  } catch {
    return null;
  }
  for (const name of entries) {
    const m = name.match(/^elasticsearch-(\d+\.\d+\.\d+)\.jar$/);
    if (m) return m[1];
  }
  return null;
}

/**
 * @param {string} dir
 * @returns {Promise<string|null>}
 */
async function versionFromGit(dir) {
  const r = await exec('git', ['describe', '--tags', '--always'], { cwd: dir, timeoutMs: 8000 });
  if (!r.ok) return null;
  const v = r.stdout.trim().split(/\r?\n/)[0];
  return v || null;
}

/**
 * @param {any} project
 * @returns {Promise<string|null>}
 */
async function detectUncached(project) {
  const dir = project.path;

  // 1. 静态覆盖
  if (typeof project.version === 'string' && project.version.trim()) {
    return project.version.trim();
  }

  // 2. 动态命令（pip 安装的服务等）
  const cmd = project.versionCommand;
  if (cmd && typeof cmd.command === 'string' && cmd.command) {
    const r = await exec(cmd.command, Array.isArray(cmd.args) ? cmd.args : [], {
      cwd: dir,
      timeoutMs: Number.isInteger(cmd.timeoutMs) ? cmd.timeoutMs : 10000,
    });
    if (r.ok) {
      const line = r.stdout
        .trim()
        .split(/\r?\n/)
        .map((x) => x.trim())
        .find(Boolean);
      if (line) return line;
    }
  }

  // 3. 根目录清单
  const rootChecks = [
    () => versionFromPackageJson(path.join(dir, 'package.json')),
    () => versionFromToml(path.join(dir, 'pyproject.toml'), 'project'),
    () => versionFromToml(path.join(dir, 'pyproject.toml'), 'tool.poetry'),
    () => versionFromToml(path.join(dir, 'Cargo.toml'), 'package'),
    () => versionFromGodot(path.join(dir, 'project.godot')),
    () => versionFromVersionFile(path.join(dir, 'VERSION')),
    () => versionFromVersionFile(path.join(dir, 'version')),
    () => versionFromReleasePlease(path.join(dir, '.release-please-manifest.json')),
  ];
  for (const check of rootChecks) {
    const v = check();
    if (v) return v;
  }

  // 4. monorepo 常见子目录
  const subChecks = [
    ['frontend', 'package.json'],
    ['backend', 'pyproject.toml'],
    ['app', 'pyproject.toml'],
    ['server', 'package.json'],
    ['game', 'project.godot'],
  ];
  for (const [subdir, file] of subChecks) {
    const p = path.join(dir, subdir, file);
    let v = null;
    if (file === 'package.json') v = versionFromPackageJson(p);
    else if (file === 'pyproject.toml') v = versionFromToml(p, 'project') ?? versionFromToml(p, 'tool.poetry');
    else if (file === 'project.godot') v = versionFromGodot(p);
    if (v) return v;
  }

  // 5. 根目录 Python 常量
  const py = versionFromPython(dir);
  if (py) return py;

  // 6. ES 发行版
  const es = versionFromElasticsearch(dir);
  if (es) return es;

  // 7. git describe 兜底
  return versionFromGit(dir);
}

/**
 * 探测项目版本。
 *
 * 优先级：管理器记录的版本（release 更新成功后写入）→ registry 静态 version
 * → 清单/命令/git 自动探测。前两者不经过缓存。
 *
 * @param {any} project
 * @returns {Promise<string|null>}
 */
export async function detectVersion(project) {
  const state = readStateVersions();
  const recorded = state[project.id];
  if (typeof recorded === 'string' && recorded.trim()) return recorded.trim();

  if (typeof project.version === 'string' && project.version.trim()) {
    return project.version.trim();
  }

  const key = `${project.id}|${project.path}|${JSON.stringify(project.versionCommand ?? null)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = await detectUncached(project);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** 测试用：清空缓存，避免临时目录复用导致串味 */
export function clearVersionCache() {
  cache.clear();
}

/**
 * 记录 release 更新后的版本，并清空探测缓存。
 *
 * 为什么不直接改 registry：registry 是用户手写的配置，路径可能是 ~/ 写法；
 * 管理器自己维护一份 data/versions.json（不入库）更安全。
 *
 * @param {string} projectId
 * @param {string} version
 */
export function recordVersion(projectId, version) {
  if (typeof projectId !== 'string' || !projectId) return;
  const v = String(version ?? '').trim();
  if (!v) return;

  const data = readStateVersions();
  data[projectId] = v;
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
  cache.clear();
}
