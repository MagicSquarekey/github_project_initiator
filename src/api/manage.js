/**
 * 项目纳管：把看板表单 / HTTP 输入归一化成合法项目条目，并原子写回 registry.json。
 *
 * 为什么需要这一层：
 *   registry 的校验很严（id 格式、端口唯一、start/stop/update 结构），
 *   让前端拼一份完全合法的 JSON 既脆弱又重复。这里集中补默认值、做友好校验，
 *   最后仍交给 validateRegistry 做最终裁决——校验规则只维护一份。
 *
 * 边界：
 *   - 只写 registry.json，绝不创建、修改或删除被管项目的任何文件；
 *   - 路径按用户输入原样保存（支持 ~ / ${ENV}），仅在比较/检查时展开。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  expandPath,
  loadRegistryRaw,
  saveRegistry,
  validateRegistry,
  VALID_KINDS,
  SELF_PROJECT_ID,
} from '../core/registry.js';

/** 带结构化错误码的纳管异常，server 层据此返回 400/403/404 */
export class ManageError extends Error {
  /**
   * @param {string} message
   * @param {'INVALID_PROJECT'|'FORBIDDEN'|'NOT_FOUND'} code
   * @param {{ errors?: string[] }} [details]
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ManageError';
    this.code = code;
    this.errors = details.errors ?? [message];
  }
}

/**
 * 把项目名转成合法 id 片段。
 *
 * 中文等非 ASCII 名称会得到 "project"；用户可在表单里手填 id。
 *
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  const s = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'project';
}

/**
 * 生成不冲突的 id：base、base-2、base-3……
 *
 * @param {string} base
 * @param {Set<string>|string[]} used
 * @returns {string}
 */
export function uniqueId(base, used) {
  const taken = used instanceof Set ? used : new Set(used ?? []);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new ManageError('无法生成唯一标识', 'INVALID_PROJECT');
}

/**
 * 解析命令行参数文本，支持单/双引号。
 *
 * 例：`/c "start app.bat"` → ['/c', 'start app.bat']
 *
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
export function parseArgs(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value !== 'string' || value.length === 0) return [];

  const out = [];
  let current = '';
  let quote = null;
  let hasContent = false;

  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = null;
      else {
        current += ch;
        hasContent = true;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasContent = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasContent) {
        out.push(current);
        current = '';
        hasContent = false;
      }
      continue;
    }
    current += ch;
    hasContent = true;
  }
  if (hasContent) out.push(current);
  return out;
}

/**
 * 解析端口输入：数字、数字数组、或 "8686, 5173" 这类文本。
 *
 * @param {any} value
 * @returns {{ ports: number[], invalid: string[] }}
 */
export function parsePortList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,\s;]+/);
  const ports = [];
  const invalid = [];

  for (const item of raw) {
    if (item === null || item === undefined || String(item).trim() === '') continue;
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      invalid.push(String(item).trim());
    } else if (!ports.includes(n)) {
      ports.push(n);
    }
  }
  return { ports, invalid };
}

/** Windows 路径大小写不敏感，比较时统一 */
function pathKey(p) {
  const resolved = path.resolve(expandPath(p));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * 把表单/API 输入归一化成项目条目（不写盘）。
 *
 * @param {any} input
 * @param {any[]} [existing]
 * @returns {{ project: any|null, errors: string[] }}
 */
export function buildProject(input, existing = []) {
  const errors = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { project: null, errors: ['请求体必须是 JSON 对象'] };
  }

  const name = String(input.name ?? '').trim();
  const rawPath = String(input.path ?? '').trim();
  const kind = String(input.kind ?? 'node-service').trim();

  if (!name) errors.push('项目名称必填');
  if (!rawPath) errors.push('项目目录必填');
  if (!VALID_KINDS.includes(kind)) {
    errors.push(`类型必须是 ${VALID_KINDS.join(' / ')}，得到 "${kind}"`);
  }

  // —— 路径：必须存在且是目录；同一目录不能重复纳管 ——
  let absPath = '';
  if (rawPath) {
    absPath = path.resolve(expandPath(rawPath));
    let stat = null;
    try {
      stat = fs.statSync(absPath);
    } catch {
      // 下面统一报错
    }
    if (!stat) {
      errors.push(`项目目录不存在：${absPath}`);
    } else if (!stat.isDirectory()) {
      errors.push(`项目路径不是目录：${absPath}`);
    } else {
      const key = pathKey(rawPath);
      const dup = existing.find((p) => typeof p?.path === 'string' && pathKey(p.path) === key);
      if (dup) errors.push(`该目录已由项目 "${dup.id}" 管理`);
    }
  }

  if (name && existing.some((p) => String(p?.name ?? '').toLowerCase() === name.toLowerCase())) {
    errors.push(`项目名称 "${name}" 已存在`);
  }

  // —— 标识：显式填写则严格校验；留空则按名称自动生成并避让冲突 ——
  const explicitId = typeof input.id === 'string' ? input.id.trim() : '';
  let id;
  if (explicitId) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(explicitId)) {
      errors.push('标识只能含小写字母/数字/连字符，且不能以连字符开头');
    }
    if (existing.some((p) => p?.id === explicitId)) {
      errors.push(`标识 "${explicitId}" 已存在`);
    }
    id = explicitId;
  } else {
    const nameSlug = slugify(name);
    // 中文名会退化成 project；此时用目录名再试一次，仍不行才用 project
    const base = nameSlug === 'project' && absPath ? slugify(path.basename(absPath)) : nameSlug;
    id = uniqueId(base, existing.map((p) => p?.id).filter(Boolean));
  }

  // —— 端口：一个字段接受 "8080" 或 "8686, 5173" ——
  const primary = parsePortList(input.port);
  const extra = parsePortList(input.ports);
  const ports = [...new Set([...primary.ports, ...extra.ports])];
  const invalidPorts = [...primary.invalid, ...extra.invalid];
  if (invalidPorts.length) {
    errors.push(`端口无效：${invalidPorts.join(', ')}（应为 1-65535 的整数）`);
  }

  // —— 启动方式 ——
  const passive = kind === 'cli-tool' || kind === 'observe-only';
  let start;
  if (input.start && typeof input.start === 'object' && !Array.isArray(input.start)) {
    start = { ...input.start };
    if (start.args !== undefined) start.args = parseArgs(start.args);
    if (start.command === undefined) start.command = null;
  } else {
    const command = String(input.startCommand ?? '').trim();
    if (!command) {
      if (!passive) {
        errors.push('启动命令必填：服务类项目需要启动命令；只想监测状态请把类型改为 cli-tool 或 observe-only');
      }
      start = { command: null, args: [] };
    } else {
      start = {
        command,
        args: parseArgs(input.startArgs),
        detached: input.detached !== false,
      };
    }
  }

  // —— 停止方式 ——
  let stop;
  if (input.stop && typeof input.stop === 'object' && !Array.isArray(input.stop)) {
    stop = { ...input.stop };
    if (stop.args !== undefined) stop.args = parseArgs(stop.args);
  } else {
    const strategy = String(input.stopStrategy ?? (ports.length ? 'port' : 'none')).trim();
    if (strategy === 'port') {
      const explicit = parsePortList(input.stopPort);
      if (explicit.invalid.length) {
        errors.push(`停止端口无效：${explicit.invalid.join(', ')}`);
      }
      const use = explicit.ports.length ? explicit.ports : ports;
      if (!use.length) {
        errors.push('停止方式为端口时必须填端口');
        stop = { strategy: 'none' };
      } else {
        stop = use.length > 1 ? { strategy: 'port', ports: use } : { strategy: 'port', port: use[0] };
      }
    } else if (strategy === 'procname') {
      const imageName = String(input.stopImageName ?? '').trim();
      if (!imageName) errors.push('停止方式为进程名时必须填进程名（如 app.exe）');
      stop = { strategy: 'procname', imageName };
    } else if (strategy === 'command') {
      const command = String(input.stopCommand ?? '').trim();
      if (!command) errors.push('停止方式为命令时必须填停止命令');
      stop = { strategy: 'command', command, args: parseArgs(input.stopArgs) };
    } else if (strategy === 'none') {
      stop = { strategy: 'none' };
    } else {
      errors.push(`停止方式 "${strategy}" 无效`);
      stop = { strategy: 'none' };
    }
  }

  // —— 更新方式 ——
  let update;
  if (input.update && typeof input.update === 'object' && !Array.isArray(input.update)) {
    update = { ...input.update };
    if (update.args !== undefined) update.args = parseArgs(update.args);
  } else {
    const strategy = String(input.updateStrategy ?? 'none').trim();
    const branch = String(input.updateBranch ?? 'main').trim() || 'main';
    if (strategy === 'none') {
      update = { strategy: 'none' };
    } else if (strategy === 'git') {
      update = {
        strategy: 'git',
        remote: String(input.updateRemote ?? 'origin').trim() || 'origin',
        branch,
      };
    } else if (strategy === 'git-fork') {
      update = {
        strategy: 'git-fork',
        remote: 'origin',
        branch,
        upstream: String(input.updateUpstream ?? 'upstream').trim() || 'upstream',
      };
    } else if (strategy === 'command') {
      const command = String(input.updateCommand ?? '').trim();
      if (!command) errors.push('更新方式为命令时必须填更新命令');
      update = { strategy: 'command', command, args: parseArgs(input.updateArgs) };
    } else if (strategy === 'release') {
      errors.push('release 更新方式字段较多，请直接编辑 data/registry.json');
      update = { strategy: 'none' };
    } else {
      errors.push(`更新方式 "${strategy}" 无效`);
      update = { strategy: 'none' };
    }
  }

  // —— 展示字段 ——
  const urlInput = typeof input.url === 'string' ? input.url.trim() : '';
  const url = urlInput || (ports.length ? `http://127.0.0.1:${ports[0]}` : null);
  const timeout = Number(input.startupTimeoutMs);
  const startupTimeoutMs = Number.isFinite(timeout) && timeout >= 0 ? Math.floor(timeout) : 120000;

  const project = {
    id,
    name,
    path: rawPath,
    enabled: input.enabled !== false,
    kind,
    start,
    stop,
    url,
    startupTimeoutMs,
    update,
  };

  if (ports.length) {
    project.port = ports[0];
    if (ports.length > 1) project.ports = ports;
  }
  if (typeof input.startupMatch === 'string' && input.startupMatch.trim()) {
    project.startupMatch = input.startupMatch.trim();
  }
  if (typeof input.notes === 'string' && input.notes.trim()) {
    project.notes = input.notes.trim();
  }
  if (typeof input.version === 'string' && input.version.trim()) {
    project.version = input.version.trim();
  }
  if (Array.isArray(input.services) && input.services.length) {
    project.services = input.services;
  }

  // 最终裁决交给 registry 校验（端口冲突、结构错误都会在这里暴露）
  if (errors.length === 0) {
    const { valid, errors: schemaErrors } = validateRegistry({
      version: 1,
      projects: [...existing, project],
    });
    if (!valid) errors.push(...schemaErrors);
  }

  return { project, errors };
}

/**
 * 纯函数版新增：返回新注册表，不写盘（便于测试与预览）。
 *
 * @param {{ version: number, projects: any[] }} data
 * @param {any} input
 * @returns {{ data?: any, project?: any, errors: string[] }}
 */
export function addProjectToRegistry(data, input) {
  const base = data && typeof data === 'object' ? data : { version: 1, projects: [] };
  const existing = Array.isArray(base.projects) ? base.projects : [];
  const { project, errors } = buildProject(input, existing);
  if (errors.length) return { errors };
  return { data: { ...base, projects: [...existing, project] }, project, errors: [] };
}

/**
 * 纯函数版移除。
 *
 * @param {{ version: number, projects: any[] }} data
 * @param {string} id
 * @returns {{ data?: any, removed?: any, error?: string }}
 */
export function removeProjectFromRegistry(data, id) {
  const base = data && typeof data === 'object' ? data : { version: 1, projects: [] };
  const existing = Array.isArray(base.projects) ? base.projects : [];
  const key = String(id ?? '').trim();
  if (!key) return { error: '缺少项目标识' };
  if (key === SELF_PROJECT_ID) return { error: '管理器自身不能从看板移除' };
  const index = existing.findIndex((p) => p?.id === key);
  if (index < 0) return { error: `项目不存在：${key}` };
  if (existing[index]?.self === true) return { error: '管理器自身不能从看板移除' };
  const next = [...existing];
  const [removed] = next.splice(index, 1);
  return { data: { ...base, projects: next }, removed };
}

/**
 * 新增项目并写盘。
 *
 * @param {any} input
 * @returns {any} 写入的项目
 */
export function addProject(input) {
  const data = loadRegistryRaw();
  const result = addProjectToRegistry(data, input);
  if (result.errors.length) {
    throw new ManageError(result.errors.join('；'), 'INVALID_PROJECT', { errors: result.errors });
  }
  saveRegistry(result.data);
  return result.project;
}

/**
 * 从看板移除项目（只改 registry.json，不碰项目文件）。
 *
 * @param {string} id
 * @returns {any} 被移除的项目
 */
export function removeProject(id) {
  const data = loadRegistryRaw();
  const key = String(id ?? '').trim();
  if (key === SELF_PROJECT_ID) {
    throw new ManageError('管理器自身不能从看板移除', 'FORBIDDEN');
  }
  const result = removeProjectFromRegistry(data, key);
  if (result.error) {
    const code = result.error.startsWith('项目不存在')
      ? 'NOT_FOUND'
      : result.error.includes('管理器自身')
        ? 'FORBIDDEN'
        : 'INVALID_PROJECT';
    throw new ManageError(result.error, code);
  }
  saveRegistry(result.data);
  return result.removed;
}
