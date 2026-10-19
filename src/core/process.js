/**
 * 子进程托管：启动项目、收日志、判断就绪、回收。
 *
 * 核心难点与取舍：
 *
 * 1. 为什么用 cmd.exe /c 而不是直接 spawn npm
 *    每个项目的启动脚本都已经处理了自己的坑（LibreTV 会检查 BUILD_ID 缺了就 build，
 *    gpp 会首次自动 npm install，qoder 有四级 Python 探测）。绕过脚本就要把这些
 *    全部重实现一遍且必然腐化。管理器只管调用和看结果。
 *
 * 2. detached 之后拿不到真实 PID
 *    cmd.exe /c 会立刻退出，真正干活的 node/python 是孙进程。所以：
 *    停止不依赖 spawn 返回的 PID，改用端口反查 / 进程名。
 *    详见 core/netstat.js。
 *
 * 3. 就绪判定
 *    优先用日志正则（startupMatch），超时后兜底做一次端口探测。
 *    日志正则比端口探测更准：端口可能先被别的进程占着。
 */

import { spawnLineReader } from '../util/exec.js';
import { createProjectLogger } from '../util/logger.js';
import { isPortOpen, isPidAlive } from './probe.js';
import { pidsOnPorts, pidsByImageName, killPids } from './platform.js';

/** 每个项目的运行期内存状态（不落盘，重启管理器即清空） */
const runtime = new Map();

/**
 * @typedef {Object} RuntimeEntry
 * @property {'idle'|'starting'|'running'|'stopping'|'failed'} phase
 * @property {number|null} pid
 * @property {number|null} startedAt
 * @property {string|null} lastError
 * @property {boolean} launcherExited 启动器（cmd.exe/cscript）是否已退出
 * @property {string[]} recentLines 最近的行，供就绪匹配与调试
 */

/**
 * @param {string} projectId
 * @returns {RuntimeEntry}
 */
function entryOf(projectId) {
  if (!runtime.has(projectId)) {
    runtime.set(projectId, {
      phase: 'idle',
      pid: null,
      startedAt: null,
      lastError: null,
      launcherExited: false,
      recentLines: [],
    });
  }
  return runtime.get(projectId);
}

/**
 * @param {string} projectId
 * @returns {RuntimeEntry}
 */
export function getRuntime(projectId) {
  return { ...entryOf(projectId) };
}

/**
 * @param {any} project
 * @returns {number[]}
 */
function portsOf(project) {
  const set = new Set();
  if (Array.isArray(project.ports)) for (const p of project.ports) if (Number.isInteger(p)) set.add(p);
  if (Number.isInteger(project.port)) set.add(project.port);
  return [...set];
}

/**
 * 启动一个项目。
 *
 * @param {any} project registry 条目
 * @returns {Promise<{ ok: boolean, message: string, pid?: number }>}
 */
export async function startProject(project) {
  const rt = entryOf(project.id);

  if (project.start?.command === null || project.start?.command === undefined) {
    return { ok: false, message: '该项目不可启动（cli-tool 类，无启动命令）' };
  }

  // 幂等：已在启动中则直接返回，避免重复拉起导致端口冲突
  if (rt.phase === 'starting') {
    return { ok: true, message: '正在启动中', pid: rt.pid };
  }

  const ports = portsOf(project);

  // 启动前校验端口空闲：避免误杀"占用者"，也避免自己起一个必然失败的服务
  for (const port of ports) {
    if (await isPortOpen(port)) {
      return {
        ok: false,
        message: `端口 ${port} 已被占用，拒绝启动。请先停止占用该端口的进程。`,
      };
    }
  }

  const projectLog = createProjectLogger(project.id);
  projectLog.write(
    `--- 启动 ${project.name}：${project.start.command} ${(project.start.args ?? []).join(' ')} ---`,
  );

  const regex = project.startupMatch ? safeRegex(project.startupMatch) : null;
  if (project.startupMatch && !regex) {
    projectLog.write(`[warn] startupMatch 不是合法正则：${project.startupMatch}，已忽略`);
  }

  rt.phase = 'starting';
  rt.lastError = null;
  rt.startedAt = Date.now();
  rt.pid = null;
  rt.recentLines = [];
  rt.launcherExited = false;

  let readyResolve;
  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });
  let readyFired = false;
  const fireReady = (how) => {
    if (readyFired) return;
    readyFired = true;
    readyResolve(how);
  };

  const onLine = (line) => {
    rt.recentLines.push(line);
    if (rt.recentLines.length > 200) rt.recentLines.shift();
    projectLog.write(line);
    if (regex && regex.test(line)) fireReady('log');
  };

  const spawned = spawnLineReader(project.start.command, project.start.args ?? [], {
    cwd: project.path,
    detached: project.start.detached !== false,
    onStdout: onLine,
    onStderr: onLine,
    onExit: ({ code, signal }) => {
      // detached 启动时启动器（cmd.exe / cscript）常常一拉起后台进程就自己退出，
      // 典型如 AutoTestHub 的 start.vbs 用 WScript.Shell.Run(..., 0) 隐藏窗口启动。
      // 此时"脚本退出"是成功转入后台的标志，不是失败——所以这里只记录，不判失败。
      // 真正的裁决交给下面的超时分支：到点后探测端口/进程再下结论。
      const elapsed = Date.now() - (rt.startedAt ?? Date.now());
      if (elapsed > 1500) {
        projectLog.write(
          `--- 启动器已退出 code=${code} signal=${signal}（elapsed=${elapsed}ms），继续等待服务就绪 ---`,
        );
      }
      rt.launcherExited = true;
      // 不再 fireReady('exit')：让流程走到超时分支做探测裁决
    },
  });

  rt.pid = spawned.pid;

  const timeoutMs = project.startupTimeoutMs ?? 60000;
  const how = await Promise.race([readyPromise, sleep(timeoutMs).then(() => 'timeout')]);

  // 日志匹配最快最准
  if (how === 'log') {
    rt.phase = 'running';
    return { ok: true, message: '已启动（日志匹配就绪）', pid: spawned.pid };
  }

  // 超时（或启动器已退出）：用端口探测做最终裁决。
  // 无端口项目（桌面程序、CLI）退化为进程名探测。
  const openPort = await firstOpenPort(ports);
  if (openPort) {
    rt.phase = 'running';
    projectLog.write(`[info] 端口 ${openPort} 已就绪，判定为启动成功`);
    return { ok: true, message: `已启动（端口 ${openPort} 就绪）`, pid: spawned.pid };
  }

  // 端口没起来，但启动器已退出：说明脚本自己跑完了（可能是构建步骤，也可能是失败）
  if (rt.launcherExited && ports.length === 0) {
    // 无端口项目无法用端口验证，只能信任"启动器正常退出"
    rt.phase = 'running';
    projectLog.write('[info] 启动器已退出且无端口可探测，判定为启动成功');
    return { ok: true, message: '已启动（启动器已退出）', pid: spawned.pid };
  }

  rt.phase = 'failed';
  rt.lastError = rt.launcherExited
    ? '启动器已退出，但服务端口未就绪'
    : `启动超时（${timeoutMs}ms）且端口未就绪`;
  projectLog.write(`[error] ${rt.lastError}`);
  return { ok: false, message: rt.lastError };
}

/**
 * 停止一个项目。
 *
 * 强杀风险：taskkill /F 不给清理机会，对会写状态文件的项目
 * （qoder 的 accounts/、wb2api 的 data/state.json）有损坏风险。
 * 所以先软杀等最多 3 秒，仍在才强杀。
 *
 * @param {any} project
 * @returns {Promise<{ ok: boolean, message: string, killedPids?: number[] }>}
 */
export async function stopProject(project) {
  const rt = entryOf(project.id);
  rt.phase = 'stopping';
  const projectLog = createProjectLogger(project.id);
  const strategy = project.stop?.strategy;

  try {
    /** @type {number[]} */
    let targets = [];

    if (strategy === 'port') {
      const ports = [
        ...(project.stop?.ports ?? []),
        ...(project.stop?.port ? [project.stop.port] : []),
      ].filter(Number.isInteger);
      targets = await pidsOnPorts(ports);
    } else if (strategy === 'procname') {
      targets = await pidsByImageName(project.stop.imageName);
    } else if (strategy === 'command') {
      await new Promise((resolve) => {
        spawnLineReader(project.stop.command, project.stop.args ?? [], {
          cwd: project.path,
          onExit: resolve,
        });
      });
      rt.phase = 'idle';
      rt.pid = null;
      projectLog.write(`--- 已执行停止命令 ${project.stop.command} ---`);
      return { ok: true, message: '已执行停止命令' };
    } else {
      // none：仅置状态位
      rt.phase = 'idle';
      rt.pid = null;
      return { ok: true, message: '该项目无停止动作，已重置状态' };
    }

    if (targets.length === 0) {
      rt.phase = 'idle';
      rt.pid = null;
      return { ok: true, message: '未发现运行中的进程', killedPids: [] };
    }

    projectLog.write(
      `--- 停止 ${project.name}，目标 PID: ${targets.join(', ')} (strategy=${strategy}) ---`,
    );

    // 先软杀（等同 WM_CLOSE，给程序自己清理的机会）
    await killPids(targets, false);

    // 等最多 3 秒，仍在则强杀
    let waited = 0;
    while (waited < 3000 && targets.some((p) => isPidAlive(p))) {
      await sleep(500);
      waited += 500;
    }
    const stillAlive = targets.filter((p) => isPidAlive(p));
    if (stillAlive.length > 0) {
      await killPids(stillAlive, true);
      projectLog.write(`[warn] 软杀超时，已强杀 PID: ${stillAlive.join(', ')}`);
    }

    rt.phase = 'idle';
    rt.pid = null;
    rt.startedAt = null;
    return { ok: true, message: `已停止（PID ${targets.join(', ')}）`, killedPids: targets };
  } catch (err) {
    rt.phase = 'idle';
    rt.lastError = err.message;
    return { ok: false, message: `停止失败：${err.message}` };
  }
}

/**
 * 重启：先停，等端口真正释放，再启动。
 *
 * 为什么要等：taskkill 返回后端口可能还没被内核释放，立刻 start 会撞
 * "端口已被占用"而失败。最多等 10 秒。
 *
 * @param {any} project
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function restartProject(project) {
  const stopped = await stopProject(project);
  if (!stopped.ok) return stopped;

  const ports = portsOf(project);
  if (ports.length > 0) {
    for (const port of ports) {
      let released = false;
      for (let i = 0; i < 20; i++) {
        if (!(await isPortOpen(port))) {
          released = true;
          break;
        }
        await sleep(500);
      }
      if (!released) {
        return { ok: false, message: `端口 ${port} 在 10 秒内未释放，放弃启动` };
      }
    }
  } else {
    // 无端口项目（桌面程序）：给进程退出留一点时间
    await sleep(1000);
  }

  return startProject(project);
}

/**
 * 返回第一个可连通的端口，都不通返回 null。
 *
 * @param {number[]} ports
 * @returns {Promise<number|null>}
 */
async function firstOpenPort(ports) {
  for (const port of ports) {
    if (await isPortOpen(port)) return port;
  }
  return null;
}

function safeRegex(pattern) {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
