/**
 * registry.json 的读写与校验。
 *
 * 设计约束：这是唯一一份用户可手改的配置，所以校验要严（写坏了一启动就报错），
 * 但报错要具体（指出第几个项目的哪个字段），不能只抛 "invalid config"。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT, 'data', 'registry.json');
/** 示例配置：入库、可移植；真正的 registry.json 含本机路径，不入库 */
const EXAMPLE_PATH = path.join(ROOT, 'data', 'registry.example.json');

const VALID_KINDS = [
  'node-service',
  'python-service',
  'java-service',
  'go-binary',
  'cli-tool',
  'desktop-app',
  'observe-only',
];
const VALID_STOP_STRATEGIES = ['port', 'procname', 'command', 'none'];
const VALID_UPDATE_STRATEGIES = ['git', 'git-fork', 'command', 'release', 'none'];

/** 管理器自身端口，注册表校验时用来检测被管项目是否冲突 */
export const MANAGER_PORT = 8780;

/** 管理器自身在看板里的条目 id。日志读取会自然命中 data/logs/manager.log */
export const SELF_PROJECT_ID = 'manager';

/** 管理器自身在看板里的显示名 */
export const SELF_PROJECT_NAME = 'github_project_initiator';

/**
 * 用户可见版本号（带 V 前缀）。
 * package.json 的 version 字段按 npm 规范只能写 0.0.1，两者语义一致。
 */
export const VERSION = 'V0.0.1';

/** 当前平台是否受支持（停止能力依赖 netstat/taskkill，仅 Windows 完整可用） */
export const PLATFORM_SUPPORTED = process.platform === 'win32';

/**
 * 展开配置里的可移植路径写法。
 *
 * 支持两种占位：
 *   ~/xxx          → 用户主目录
 *   ${ENV_NAME}    → 环境变量
 *
 * 为什么需要：开源仓库里不能写死 C:/Users/<你的名字>/...。
 * 示例配置用 ~ 表示；用户本机那份 registry.json（不入库）写绝对路径也可以。
 *
 * @param {string} value
 * @returns {string}
 */
export function expandPath(value) {
  if (typeof value !== 'string' || value.length === 0) return value;

  let out = value;
  if (out === '~') out = os.homedir();
  else if (out.startsWith('~/') || out.startsWith('~\\')) out = path.join(os.homedir(), out.slice(2));

  out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name) =>
    process.env[name] !== undefined ? process.env[name] : whole,
  );
  return out;
}

/**
 * 返回一份路径已展开的项目副本（不修改入参）。
 *
 * @param {any} project
 * @returns {any}
 */
function withExpandedPaths(project) {
  const next = { ...project, path: expandPath(project.path) };
  if (project.start) {
    next.start = {
      ...project.start,
      command:
        typeof project.start.command === 'string' ? expandPath(project.start.command) : project.start.command,
      args: Array.isArray(project.start.args) ? project.start.args.map(expandPath) : project.start.args,
    };
    if (project.start.afterReady) {
      next.start.afterReady = {
        ...project.start.afterReady,
        command:
          typeof project.start.afterReady.command === 'string'
            ? expandPath(project.start.afterReady.command)
            : project.start.afterReady.command,
        args: Array.isArray(project.start.afterReady.args)
          ? project.start.afterReady.args.map(expandPath)
          : project.start.afterReady.args,
      };
    }
  }
  if (project.stop) {
    next.stop = {
      ...project.stop,
      command: typeof project.stop.command === 'string' ? expandPath(project.stop.command) : project.stop.command,
      args: Array.isArray(project.stop.args) ? project.stop.args.map(expandPath) : project.stop.args,
    };
  }
  if (project.versionCommand) {
    next.versionCommand = {
      ...project.versionCommand,
      command:
        typeof project.versionCommand.command === 'string'
          ? expandPath(project.versionCommand.command)
          : project.versionCommand.command,
      args: Array.isArray(project.versionCommand.args)
        ? project.versionCommand.args.map(expandPath)
        : project.versionCommand.args,
    };
  }
  if (project.update?.strategy === 'command') {
    next.update = {
      ...project.update,
      command: typeof project.update.command === 'string' ? expandPath(project.update.command) : project.update.command,
      args: Array.isArray(project.update.args) ? project.update.args.map(expandPath) : project.update.args,
    };
  }
  return next;
}

/**
 * 管理器自身的看板条目。
 *
 * 它不是用户配置的一部分：loadRegistry() 每次动态注入，saveRegistry() 写盘时剥离。
 * 不写进 registry.json 的理由：
 *   - 路径就是代码根目录，写死绝对路径会破坏开源配置的可移植性；
 *   - 不允许用户误删或改成可启停——停止自己等于关掉看板；
 *   - 端口 8780 本来就禁止被其他条目占用，自身是唯一的合法使用者。
 *
 * kind=observe-only：状态由进程自身提供，不做 TCP 自连、不启动、不停止。
 * id=manager 与日志文件名对齐，日志按钮直接读 data/logs/manager.log。
 *
 * @returns {any}
 */
export function buildSelfProject() {
  return {
    id: SELF_PROJECT_ID,
    name: SELF_PROJECT_NAME,
    path: ROOT,
    enabled: true,
    self: true,
    kind: 'observe-only',
    start: { command: null, args: [] },
    stop: { strategy: 'none' },
    url: `http://127.0.0.1:${MANAGER_PORT}`,
    port: MANAGER_PORT,
    startupTimeoutMs: 0,
    update: { strategy: 'none' },
    notes: '管理器自身：状态由当前进程提供，不能在看板里启停或更新。升级请手动 git pull 后重启进程。',
  };
}

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
  // 合成条目是唯一允许声明管理器端口的项目（它本来就是管理器）
  const isSelf = p.self === true;
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
  if (start?.afterReady !== undefined) {
    const ar = start.afterReady;
    if (!ar || typeof ar !== 'object' || Array.isArray(ar)) {
      errors.push(`${where}.start.afterReady: 必须是对象`);
    } else {
      if (typeof ar.command !== 'string' || ar.command.length === 0) {
        errors.push(`${where}.start.afterReady.command: 必填字符串`);
      }
      if (ar.args !== undefined && (!Array.isArray(ar.args) || ar.args.some((a) => typeof a !== 'string'))) {
        errors.push(`${where}.start.afterReady.args: 必须是字符串数组`);
      }
      if (ar.detached !== undefined && typeof ar.detached !== 'boolean') {
        errors.push(`${where}.start.afterReady.detached: 必须是布尔值`);
      }
    }
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
      if (stop.imageName !== undefined) {
        if (typeof stop.imageName !== 'string' || !stop.imageName.toLowerCase().endsWith('.exe')) {
          errors.push(`${where}.stop.imageName: 必须以 .exe 结尾`);
        }
      }
      if (stop.imageNames !== undefined) {
        if (
          !Array.isArray(stop.imageNames) ||
          stop.imageNames.some((n) => typeof n !== 'string' || !n.toLowerCase().endsWith('.exe'))
        ) {
          errors.push(`${where}.stop.imageNames: 必须是 .exe 字符串数组`);
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
    } else if (p.port === MANAGER_PORT && !isSelf) {
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
        } else if (pt === MANAGER_PORT && !isSelf) {
          errors.push(`${where}.ports: ${MANAGER_PORT} 是管理器自身端口，不能复用`);
        }
      }
    }
  }

  // update
  const update = p.update;
  if (!update || typeof update !== 'object') {
    errors.push(`${where}.update: 必填对象`);
  } else if (!VALID_UPDATE_STRATEGIES.includes(update.strategy)) {
    errors.push(`${where}.update.strategy: 必须是 ${VALID_UPDATE_STRATEGIES.join(' / ')}`);
  } else if (update.strategy === 'command') {
    if (typeof update.command !== 'string' || update.command.length === 0) {
      errors.push(`${where}.update.command: strategy=command 时必填字符串`);
    }
    if (update.args !== undefined && (!Array.isArray(update.args) || update.args.some((a) => typeof a !== 'string'))) {
      errors.push(`${where}.update.args: 必须是字符串数组`);
    }
    if (update.timeoutMs !== undefined && (typeof update.timeoutMs !== 'number' || update.timeoutMs < 0)) {
      errors.push(`${where}.update.timeoutMs: 必须是非负数`);
    }
  } else if (update.strategy === 'release') {
    if (typeof update.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(update.repo)) {
      errors.push(`${where}.update.repo: strategy=release 时必填 owner/name`);
    }
    if (!['binary', 'overlay'].includes(update.mode)) {
      errors.push(`${where}.update.mode: 必须是 binary / overlay`);
    }
    if (update.mode === 'binary' && (typeof update.target !== 'string' || update.target.length === 0)) {
      errors.push(`${where}.update.target: mode=binary 时必填目标文件名`);
    }
    if (update.asset !== undefined && typeof update.asset !== 'string') {
      errors.push(`${where}.update.asset: 必须是字符串（资产名 glob）`);
    }
    if (update.checksums !== undefined && typeof update.checksums !== 'string') {
      errors.push(`${where}.update.checksums: 必须是字符串（checksums 资产名）`);
    }
    if (
      update.preserve !== undefined &&
      (!Array.isArray(update.preserve) || update.preserve.some((x) => typeof x !== 'string'))
    ) {
      errors.push(`${where}.update.preserve: 必须是字符串数组`);
    }
    if (
      update.stripComponents !== undefined &&
      (!Number.isInteger(update.stripComponents) || update.stripComponents < 0)
    ) {
      errors.push(`${where}.update.stripComponents: 必须是非负整数`);
    }
    if (update.timeoutMs !== undefined && (typeof update.timeoutMs !== 'number' || update.timeoutMs < 0)) {
      errors.push(`${where}.update.timeoutMs: 必须是非负数`);
    }
  }

  if (update && typeof update === 'object') {
    for (const key of ['stopBefore', 'startAfter']) {
      if (update[key] !== undefined && typeof update[key] !== 'boolean') {
        errors.push(`${where}.update.${key}: 必须是布尔值`);
      }
    }
  }

  // 可选：版本号覆盖 / 动态版本命令
  if (p.version !== undefined && p.version !== null) {
    if (typeof p.version !== 'string' || p.version.trim().length === 0) {
      errors.push(`${where}.version: 必须是非空字符串`);
    }
  }
  if (p.versionCommand !== undefined && p.versionCommand !== null) {
    const vc = p.versionCommand;
    if (!vc || typeof vc !== 'object' || Array.isArray(vc)) {
      errors.push(`${where}.versionCommand: 必须是对象`);
    } else {
      if (typeof vc.command !== 'string' || vc.command.length === 0) {
        errors.push(`${where}.versionCommand.command: 必填字符串`);
      }
      if (!Array.isArray(vc.args) || vc.args.some((a) => typeof a !== 'string')) {
        errors.push(`${where}.versionCommand.args: 必须是字符串数组`);
      }
      if (vc.timeoutMs !== undefined && (typeof vc.timeoutMs !== 'number' || vc.timeoutMs < 0)) {
        errors.push(`${where}.versionCommand.timeoutMs: 必须是非负数`);
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
  // 首次运行（开源用户克隆后）：从示例配置引导，避免直接报"文件不存在"
  if (!fs.existsSync(REGISTRY_PATH) && fs.existsSync(EXAMPLE_PATH)) {
    fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
    fs.copyFileSync(EXAMPLE_PATH, REGISTRY_PATH);
    logger.info('未找到 data/registry.json，已从 registry.example.json 创建', {
      hint: '按本机实际路径修改后重启',
    });
  }

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

  // 管理器自身也纳入监测：动态注入，不落盘。
  // 用户若已手工声明 self 条目（或占用 manager 这个 id），尊重用户的定义，避免重复。
  const hasSelf = data.projects.some((p) => p?.self === true || p?.id === SELF_PROJECT_ID);
  const projects = hasSelf ? data.projects : [buildSelfProject(), ...data.projects];

  // 返回展开后的副本：业务层拿到的永远是真实路径，配置里可继续用 ~ / ${ENV}
  return { ...data, projects: projects.map(withExpandedPaths) };
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
  // 合成条目不属于用户配置：即使调用方把 loadRegistry() 的结果原样传进来，
  // 也不能把它写进 registry.json。
  const persisted = {
    ...data,
    projects: (Array.isArray(data.projects) ? data.projects : []).filter((p) => p?.self !== true),
  };
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  const tmp = `${REGISTRY_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, REGISTRY_PATH);
  logger.debug('注册表已保存', { projects: persisted.projects.length });
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
