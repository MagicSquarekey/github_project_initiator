/**
 * 项目 API：状态聚合 + 生命周期 + 更新。
 *
 * 这一层把所有 core 能力编排成看板需要的数据形状。
 * 关键约束：GET /api/projects 会被前端每 3 秒轮询一次，所以必须快——
 * git fetch 这种慢操作只在后台定时做，绝不放在这个请求里。
 */

import path from 'node:path';
import fs from 'node:fs';
import { loadRegistry, portsOf } from '../core/registry.js';
import { probeProject } from '../core/probe.js';
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
  const [probe, git] = await Promise.all([probeProject(project), gitSnapshot(project.path)]);
  const rt = getRuntime(project.id);
  const ports = portsOf(project);

  // 可更新性：需要是 git 仓库 + 配置了 git 策略
  const updatable = git.isRepo && project.update?.strategy !== 'none';

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

    running: probe.running,
    runningVia: probe.via,
    openPorts: probe.openPorts ?? [],
    pids: probe.pids ?? [],
    phase: rt.phase,
    lastError: rt.lastError,

    ports,
    url: project.url ?? null,
    uptimeSec: rt.startedAt && probe.running ? Math.floor((Date.now() - rt.startedAt) / 1000) : null,

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
