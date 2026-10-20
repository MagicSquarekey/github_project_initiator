/**
 * 项目 API：状态聚合 + 生命周期 + 更新。
 *
 * 这一层把所有 core 能力编排成看板需要的数据形状。
 * 关键约束：GET /api/projects 会被前端每 3 秒轮询一次，所以必须快——
 * git fetch 这种慢操作只在后台定时做，绝不放在这个请求里。
 */

import path from 'node:path';
import fs from 'node:fs';
import { loadRegistry, portsOf, VERSION } from '../core/registry.js';
import { probeProject } from '../core/probe.js';
import { detectVersion } from '../core/version.js';
import { gitSnapshot } from '../core/git.js';
import { startProject, stopProject, restartProject, getRuntime } from '../core/process.js';
import { updateProject } from '../core/update.js';
import { readProjectLog } from '../util/logger.js';
import { logger } from '../util/logger.js';

/**
 * 单个项目的完整状态（看板卡片需要的全部字段）。
 *
 * @param {any} project
 * @returns {Promise<any>}
 */
export async function describeProject(project) {
  const self = project.self === true;
  const [probe, git, version] = await Promise.all([
    probeProject(project),
    gitSnapshot(project.path),
    self ? Promise.resolve(VERSION) : detectVersion(project),
  ]);
  const rt = getRuntime(project.id);
  const ports = portsOf(project);

  // 可更新性：
  //   git / git-fork → 必须是 git 仓库（启动器绝不为更新而 git init）
  //   command / release → 非 git 项目也能一键更新
  const updateStrategy = project.update?.strategy ?? 'none';
  const updatable =
    updateStrategy === 'command' ||
    updateStrategy === 'release' ||
    (git.isRepo && updateStrategy !== 'none');

  // 启动脚本存在性：缺脚本时启动必然失败，提前暴露比让用户点了报错好
  let startable = project.start?.command !== null && project.start?.command !== undefined;
  if (startable && project.start?.command) {
    const scriptPath = resolveStartScript(project);
    if (scriptPath && !fs.existsSync(scriptPath)) {
      startable = false;
    }
  }

  return {
    id: project.id,
    name: project.name,
    kind: project.kind,
    path: project.path,
    enabled: project.enabled !== false,
    notes: project.notes ?? null,
    // 管理器自身：看板据此隐藏启停按钮、显示"自身"标记
    self,
    // 版本号：清单/命令/git/ES jar 自动探测；自身用 VERSION 常量
    version,

    running: probe.running,
    runningVia: probe.via,
    openPorts: probe.openPorts ?? [],
    pids: probe.pids ?? [],
    phase: rt.phase,
    lastError: rt.lastError,

    ports,
    url: project.url ?? null,
    // 多服务项目（如 AutoTestHub 的 backend+frontend）的子服务清单，看板用来展示
    services: Array.isArray(project.services) ? project.services : null,
    // 自身条目的运行时长来自进程本身；其他项目来自管理器的启动记录
    uptimeSec: self
      ? Math.floor(process.uptime())
      : rt.startedAt && probe.running
        ? Math.floor((Date.now() - rt.startedAt) / 1000)
        : null,

    startable,
    updatable,
    git: {
      isRepo: git.isRepo,
      branch: git.branch,
      dirty: git.dirty,
      behind: git.behind,
      ahead: git.ahead,
      head: git.head,
      remotes: git.remotes,
    },
  };
}

/**
 * 管理器自身不允许被看板控制。
 *
 * 这不是权限问题，而是物理限制：停止自己 = 看板立刻消失，
 * 重启自己 = 先杀掉唯一能重新拉起自己的进程。启动同理——看板已经停了，
 * 没有人能点这个按钮。所以把动作明确拒绝，并告诉用户该怎么做。
 *
 * @param {any} project
 * @param {'start'|'stop'|'restart'|'update'} action
 * @returns {{ ok: false, message: string }|null}
 */
export function guardSelfAction(project, action) {
  if (project?.self !== true) return null;

  const messages = {
    start: '管理器不能启动自身：它正在运行。若已停止，请从终端执行 node src/index.js。',
    stop: '管理器不能停止自身：停止后看板会立即消失。请用 Ctrl+C 或关闭终端。',
    restart: '管理器不能重启自身：重启期间看板不可用。请在终端里手动重启。',
    update: '管理器不通过看板更新自身：请手动 git pull 后重启进程，让新代码生效。',
  };
  return { ok: false, message: messages[action] ?? '管理器自身不可执行该操作。' };
}

/**
 * 解析启动脚本的绝对路径，用于存在性预检。
 *
 * 只处理两种可判定的形态：
 *   cmd.exe /c <脚本名>            → 脚本在 args 里
 *   <可执行文件>（无 args，如 wb2api.exe） → 就是 command 本身
 *
 * 复杂的 cmd 命令行（含 if / start / && / 管道，如桌面程序的启动命令）
 * 无法静态解析出脚本路径，直接返回 null 跳过检查——查不了不该误报成"不可启动"。
 *
 * @param {any} project
 * @returns {string|null}
 */
function resolveStartScript(project) {
  const cmd = (project.start?.command ?? '').toLowerCase();
  if (!cmd) return null;

  // cmd.exe /c xxx.bat：脚本是 /c 之后第一个参数
  if (cmd.endsWith('cmd.exe')) {
    const args = project.start.args ?? [];
    const script = args.find((a, i) => i > 0 && !a.startsWith('/') && !a.startsWith('-'));
    // 脚本名必须是单纯的文件名（可含路径分隔符），不能是复杂命令
    if (!script) return null;
    if (/[&|<>]|\bif\b|\bfor\b|\bstart\b/i.test(script)) return null;
    return path.resolve(project.path, script);
  }

  // 直接可执行文件且无参数：command 本身就是文件
  if (!project.start.args?.length) {
    if (/[&|<>]/.test(project.start.command)) return null;
    return path.resolve(project.path, project.start.command);
  }

  return null;
}

/**
 * 所有项目状态。
 *
 * @returns {Promise<{ projects: any[] }>}
 */
export async function describeAll() {
  const { projects } = loadRegistry();
  const described = await Promise.all(projects.map(describeProject));
  return { projects: described };
}

/**
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function describeOne(id) {
  const { projects } = loadRegistry();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error(`项目不存在：${id}`);
  return describeProject(project);
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function start(id) {
  const { projects } = loadRegistry();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error(`项目不存在：${id}`);
  const guarded = guardSelfAction(project, 'start');
  if (guarded) return guarded;
  const result = await startProject(project);
  logger.info('启动请求完成', { id, ...result });
  return result;
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function stop(id) {
  const { projects } = loadRegistry();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error(`项目不存在：${id}`);
  const guarded = guardSelfAction(project, 'stop');
  if (guarded) return guarded;
  const result = await stopProject(project);
  logger.info('停止请求完成', { id, ...result });
  return result;
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function restart(id) {
  const { projects } = loadRegistry();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error(`项目不存在：${id}`);
  const guarded = guardSelfAction(project, 'restart');
  if (guarded) return guarded;
  const result = await restartProject(project);
  logger.info('重启请求完成', { id, ...result });
  return result;
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: boolean, message: string, output?: string }>}
 */
export async function update(id) {
  const { projects } = loadRegistry();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error(`项目不存在：${id}`);
  const guarded = guardSelfAction(project, 'update');
  if (guarded) return guarded;
  const result = await updateProject(project);
  logger.info('更新请求完成', { id, ok: result.ok, message: result.message });
  return result;
}

/**
 * 批量更新。顺序执行而非并发——并发 pull 会让网络互相抢占，
 * 且输出交错后人看不懂谁失败了。
 *
 * @returns {Promise<{ results: any[] }>}
 */
export async function updateAll() {
  const { projects } = loadRegistry();
  const results = [];
  for (const project of projects) {
    // 自身不参与批量更新：它不能在看板里更新自己（见 guardSelfAction），
    // 也不该在"成功 x/y"里被算成一个失败项。
    if (project.self === true) continue;
    if (!project.enabled) {
      results.push({ id: project.id, name: project.name, ok: false, message: '已禁用，跳过' });
      continue;
    }
    try {
      const r = await updateProject(project);
      results.push({ id: project.id, name: project.name, ...r });
    } catch (err) {
      results.push({ id: project.id, name: project.name, ok: false, message: err.message });
    }
  }
  return { results };
}

/**
 * @param {string} id
 * @param {number} [lines]
 */
export function logs(id, lines = 200) {
  return { id, lines: readProjectLog(id, lines) };
}
