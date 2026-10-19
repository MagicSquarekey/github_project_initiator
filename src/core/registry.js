/**
 * registry.json 的读写与校验。
 *
 * 设计约束：这是唯一一份用户可手改的配置，所以校验要严（写坏了一启动就报错），
 * 但报错要具体（指出第几个项目的哪个字段），不能只抛 "invalid config"。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT, 'data', 'registry.json');

const VALID_KINDS = ['node-service', 'python-service', 'go-binary', 'cli-tool', 'desktop-app', 'observe-only'];
const VALID_STOP_STRATEGIES = ['port', 'procname', 'command', 'none'];
const VALID_UPDATE_STRATEGIES = ['git', 'git-fork', 'git-clone', 'none'];

/** 管理器自身端口，注册表校验时用来检测被管项目是否冲突 */
export const MANAGER_PORT = 8780;

/** 版本号：与 package.json 保持同步即可，不引依赖 */
export const VERSION = '1.1.0';

/** 当前平台是否受支持（停止能力依赖 netstat/taskkill，仅 Windows 完整可用） */
export const PLATFORM_SUPPORTED = process.platform === 'win32';

/**
 * 校验单个项目条目，返回错误信息数组（空数组 = 合法）。
 *
 * @param {any} p
 * @param {number} index
 * @returns {string[]}
 */
function validateProject(p, index) {
  const errors = [];
  const where = `projects[${index}]${p?.id ? ` (${p.id})` : ''}`;

  if (!p || typeof p !== 'object') {
    errors.push(`${where}: 必须是对象`);
    return errors;
  }
  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) {
    errors.push(`${where}.id: 必填，且只能含小写字母/数字/连字符`);
  }
  if (typeof p.name !== 'string' || p.name.length === 0) {
    errors.push(`${where}.name: 必填字符串`);
  }
  if (typeof p.path !== 'string' || p.path.length === 0) {
    errors.push(`${where}.path: 必填字符串`);
  }
  if (!VALID_KINDS.includes(p.kind)) {
    errors.push(`${where}.kind: 必须是 ${VALID_KINDS.join(' / ')}，得到 "${p.kind}"`);
  }

  // start
  const start = p.start;
  if (!start || typeof start !== 'object') {
    errors.push(`${where}.start: 必填对象`);
  } else if (start.command !== null && start.command !== undefined) {
    if (typeof start.command !== 'string') {
      errors.push(`${where}.start.command: 必须是字符串或 null`);
    }
    if (start.command !== null && !Array.isArray(start.args)) {
      errors.push(`${where}.start.args: command 非空时必须是数组`);
    }
  }
  // command 为 null 表示不可启动。两种正当场景：
  //   cli-tool     —— REA 这类 CLI/MCP 工具，无启停概念
  //   observe-only —— 只观察状态不启动（如与他人共用启动脚本的从属条目）
  if (start?.command === null && !['cli-tool', 'observe-only'].includes(p.kind)) {
    errors.push(`${where}.start.command 为 null 仅允许用于 kind=cli-tool 或 observe-only`);
  }

  // stop
  const stop = p.stop;
  if (!stop || typeof stop !== 'object') {
    errors.push(`${where}.stop: 必填对象`);
  } else {
    if (!VALID_STOP_STRATEGIES.includes(stop.strategy)) {
      errors.push(`${where}.stop.strategy: 必须是 ${VALID_STOP_STRATEGIES.join(' / ')}`);
    }
    if (stop.strategy === 'port') {
      const ports = stop.ports ?? (stop.port !== undefined && stop.port !== null ? [stop.port] : []);
      if (!Array.isArray(ports) || ports.length === 0) {
        errors.push(`${where}.stop: strategy=port 需要 port 或 ports 数组`);
      } else {
        for (const pt of ports) {
          if (!Number.isInteger(pt) || pt < 1 || pt > 65535) {
            errors.push(`${where}.stop: 端口 "${pt}" 不是有效端口号`);
          }
        }
      }
    }
    if (stop.strategy === 'procname') {
      if (typeof stop.imageName !== 'string' || !stop.imageName) {
        errors.push(`${where}.stop.imageName: strategy=procname 时必填`);
      } else if (!stop.imageName.toLowerCase().endsWith('.exe')) {
        errors.push(`${where}.stop.imageName: 必须以 .exe 结尾（taskkill /IM 的要求）`);
      }
    }
    if (stop.strategy === 'command') {
      if (typeof stop.command !== 'string' || !stop.command) {
        errors.push(`${where}.stop.command: strategy=command 时必填`);
      }
    }
  }

  // 端口字段
  if (p.port !== undefined && p.port !== null) {
    if (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535) {
      errors.push(`${where}.port: 必须是 1-65535 的整数`);
    } else if (p.port === MANAGER_PORT) {
      errors.push(`${where}.port: ${MANAGER_PORT} 是管理器自身端口，不能复用`);
    }
  }
  if (p.ports !== undefined) {
    if (!Array.isArray(p.ports)) {
      errors.push(`${where}.ports: 必须是数组`);
    } else {
      for (const pt of p.ports) {
        if (!Number.isInteger(pt) || pt < 1 || pt > 65535) {
          errors.push(`${where}.ports: "${pt}" 不是有效端口号`);
        } else if (pt === MANAGER_PORT) {
          errors.push(`${where}.ports: ${MANAGER_PORT} 是管理器自身端口，不能复用`);
        }
      }
    }
  }

  // update
  const update = p.update;
  if (!update || typeof update !== 'object') {
    errors.push(`${where}.update: 必填对象`);
  } else {
    if (!VALID_UPDATE_STRATEGIES.includes(update.strategy)) {
      errors.push(`${where}.update.strategy: 必须是 ${VALID_UPDATE_STRATEGIES.join(' / ')}`);
    }
    // git-clone 需要知道上游地址，否则没法拉
    if (update.strategy === 'git-clone') {
      if (typeof update.repoUrl !== 'string' || !update.repoUrl) {
        errors.push(`${where}.update.repoUrl: strategy=git-clone 时必填（上游仓库地址）`);
      } else if (!/^(https?:\/\/|git@)/i.test(update.repoUrl)) {
        errors.push(`${where}.update.repoUrl: 必须是 http(s):// 或 git@ 开头的仓库地址`);
      }
    }
  }

  if (typeof p.startupTimeoutMs !== 'number' || p.startupTimeoutMs < 0) {
    errors.push(`${where}.startupTimeoutMs: 必须是非负整数（毫秒）`);
  }

  return errors;
}

/**
 * 校验整份注册表。
 *
 * @param {any} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRegistry(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return { valid: false, errors: ['注册表必须是 JSON 对象'] };
  if (data.version !== 1) errors.push(`version: 目前只支持 1，得到 "${data.version}"`);
  if (!Array.isArray(data.projects)) {
    errors.push('projects: 必须是数组');
    return { valid: false, errors };
  }

  const seen = new Set();
  for (let i = 0; i < data.projects.length; i++) {
    errors.push(...validateProject(data.projects[i], i));
    const id = data.projects[i]?.id;
    if (typeof id === 'string') {
      if (seen.has(id)) errors.push(`projects[${i}].id: "${id}" 重复`);
      seen.add(id);
    }
  }

  // 端口唯一性：两个不同项目占同一端口必然有一个起不来。
  // 注意同一项目的 port / ports / stop.port 可能声明同一端口（如 backend 的 8686），
  // 这是合法的——所以先按项目归并，再跨项目比对。
  const portOwners = new Map();
  for (const p of data.projects) {
    const own = new Set([
      ...(Array.isArray(p.ports) ? p.ports : []),
      ...(p.port ? [p.port] : []),
      ...(Array.isArray(p.stop?.ports) ? p.stop.ports : []),
      ...(p.stop?.port ? [p.stop.port] : []),
    ]);
    for (const pt of own) {
      if (!Number.isInteger(pt)) continue;
      if (portOwners.has(pt) && portOwners.get(pt) !== p.id) {
        errors.push(`端口 ${pt} 同时被 "${portOwners.get(pt)}" 和 "${p.id}" 使用`);
      } else {
        portOwners.set(pt, p.id);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 读取注册表。校验失败时抛出带完整错误列表的 Error。
 *
 * @returns {{ version: number, projects: any[] }}
 */
export function loadRegistry() {
  let raw;
  try {
    raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  } catch (err) {
    throw new Error(`无法读取注册表 ${REGISTRY_PATH}：${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`注册表不是合法 JSON：${err.message}`);
  }

  const { valid, errors } = validateRegistry(data);
  if (!valid) {
    throw new Error(`注册表校验失败（共 ${errors.length} 处）：\n  - ${errors.join('\n  - ')}`);
  }

  return data;
}

/**
 * 保存注册表（原子写：先写临时文件再 rename，避免半途崩溃留下损坏文件）。
 *
 * @param {{ version: number, projects: any[] }} data
 */
export function saveRegistry(data) {
  const { valid, errors } = validateRegistry(data);
  if (!valid) {
    throw new Error(`拒绝保存：注册表校验失败：${errors.join('；')}`);
  }
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  const tmp = `${REGISTRY_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, REGISTRY_PATH);
  logger.debug('注册表已保存', { projects: data.projects.length });
}

/**
 * 按 id 查项目。
 *
 * @param {string} id
 * @returns {any}
 */
export function getProject(id) {
  const { projects } = loadRegistry();
  const p = projects.find((x) => x.id === id);
  if (!p) throw new Error(`项目不存在：${id}`);
  return p;
}

/**
 * 规范化项目的端口列表：兼容 port 单值与 ports 数组两种写法。
 *
 * @param {any} p
 * @returns {number[]}
 */
export function portsOf(p) {
  const set = new Set();
  if (Array.isArray(p.ports)) for (const x of p.ports) if (Number.isInteger(x)) set.add(x);
  if (Number.isInteger(p.port)) set.add(p.port);
  if (Array.isArray(p.stop?.ports)) for (const x of p.stop.ports) if (Number.isInteger(x)) set.add(x);
  if (Number.isInteger(p.stop?.port)) set.add(p.stop.port);
  return [...set];
}

export { REGISTRY_PATH, ROOT };
