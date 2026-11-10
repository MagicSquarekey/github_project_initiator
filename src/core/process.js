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
 * 主服务就绪后的附加动作（旧机制，保留兼容）。
 *
 * 只负责"拉起来"，不校验结果、不参与停止端口集合。
 * 需要共同启停的伴随服务请用 start.companions。
 *
 * @param {any} project
 */
function runAfterReady(project) {
  const cfg = project.start?.afterReady;
  if (!cfg || typeof cfg.command !== 'string' || !cfg.command) return;

  const log = createProjectLogger(project.id);
  try {
    spawnLineReader(cfg.command, Array.isArray(cfg.args) ? cfg.args : [], {
      cwd: project.path,
      detached: cfg.detached !== false,
      onStdout: (line) => log.write(`[afterReady] ${line}`),
      onStderr: (line) => log.write(`[afterReady] ${line}`),
    });
  } catch (err) {
    log.write(`[afterReady] 启动失败：${err.message}`);
  }
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
 * 伴随服务：主服务就绪后一起拉起、一起停止的进程（如 OpenViking 的 vikingbot）。
 *
 * @param {any} project
 * @returns {any[]}
 */
function companionsOf(project) {
  const list = project.start?.companions;
  if (!Array.isArray(list)) return [];
  return list.filter((c) => c && typeof c.command === 'string' && c.command.length > 0);
}

/**
 * 停止/重启需要覆盖的全部端口。
 *
 * 除了 stop 里显式声明的端口，还纳入主服务、子服务、伴随服务声明的端口——
 * 否则"共同启停"会漏掉只写在 companions 里的 bot。
 *
 * @param {any} project
 * @returns {number[]}
 */
function stopPortsOf(project) {
  const set = new Set();
  for (const p of project.stop?.ports ?? []) if (Number.isInteger(p)) set.add(p);
  if (Number.isInteger(project.stop?.port)) set.add(project.stop.port);
  for (const p of portsOf(project)) set.add(p);
  for (const s of project.services ?? []) if (Number.isInteger(s?.port)) set.add(s.port);
  for (const c of companionsOf(project)) if (Number.isInteger(c.port)) set.add(c.port);
  return [...set];
}

function companionName(c) {
  if (typeof c.name === 'string' && c.name) return c.name;
  const base = String(c.command ?? '').split(/[\\/]/).pop() || 'companion';
  return base.replace(/\.exe$/i, '');
}

/**
 * 等待端口进入监听；aborted() 返回 true 时提前放弃（如伴随进程直接退出）。
 *
 * @param {number} port
 * @param {number} timeoutMs
 * @param {() => boolean} [aborted]
 * @returns {Promise<boolean>}
 */
async function waitForPort(port, timeoutMs, aborted) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await isPortOpen(port)) return true;
    if (aborted?.()) return false;
    if (Date.now() >= deadline) return false;
    await sleep(500);
  }
}

/**
 * 拉起缺失的伴随服务，并按端口校验就绪。
 *
 * 端口已在监听的伴随服务会被跳过（视为已在运行），这样"主服务已启动、
 * bot 掉了"的场景点一次启动就能补齐，而不会重复拉起。
 *
 * @param {any} project
 * @param {any[]} companions
 * @param {{ write: (line: string) => void }} projectLog
 * @returns {Promise<{ ok: boolean, message: string, started: string[], skipped: string[] }>}
 */
async function ensureCompanions(project, companions, projectLog) {
  const started = [];
  const skipped = [];
  const failed = [];

  for (const c of companions) {
    const name = companionName(c);

    if (Number.isInteger(c.port) && (await isPortOpen(c.port))) {
      projectLog.write(`[companion:${name}] 端口 ${c.port} 已在监听，跳过启动`);
      skipped.push(name);
      continue;
    }

    projectLog.write(
      `--- 启动伴随服务 ${name}：${c.command} ${(c.args ?? []).join(' ')} ---`,
    );

    let exited = false;
    let exitCode = null;
    let spawnError = null;
    try {
      spawnLineReader(c.command, c.args ?? [], {
        cwd: project.path,
        detached: c.detached !== false,
        env: c.env ? { ...process.env, ...c.env } : undefined,
        onStdout: (line) => projectLog.write(`[companion:${name}] ${line}`),
        onStderr: (line) => projectLog.write(`[companion:${name}] ${line}`),
        onExit: ({ code }) => {
          exited = true;
          exitCode = code;
        },
        onError: (err) => {
          spawnError = err;
        },
      });
    } catch (err) {
      failed.push({ name, required: c.required !== false, reason: `无法启动：${err.message}` });
      continue;
    }

    // 没有声明端口的伴随服务无法验证，只能按"已拉起"处理
    if (!Number.isInteger(c.port)) {
      started.push(name);
      continue;
    }

    const timeoutMs = c.timeoutMs ?? 60000;
    const ready = await waitForPort(
      c.port,
      timeoutMs,
      () => Boolean(spawnError) || (exited && exitCode !== 0),
    );

    if (ready) {
      projectLog.write(`[companion:${name}] 端口 ${c.port} 已就绪`);
      started.push(name);
    } else {
      const reason = spawnError
        ? `无法启动：${spawnError.message}`
        : exited
          ? `进程已退出（code=${exitCode}），端口 ${c.port} 未监听`
          : `端口 ${c.port} 在 ${timeoutMs}ms 内未监听`;
      projectLog.write(`[error] 伴随服务 ${name}：${reason}`);
      failed.push({ name, required: c.required !== false, reason });
    }
  }

  const requiredFailed = failed.filter((f) => f.required);
  if (requiredFailed.length > 0) {
    return {
      ok: false,
      message: requiredFailed.map((f) => `伴随服务 ${f.name} 未就绪（${f.reason}）`).join('；'),
      started,
      skipped,
    };
  }
  return { ok: true, message: '', started, skipped };
}

/**
 * 把伴随服务的处理结果拼进启动消息。
 *
 * @param {string} base
 * @param {{ started: string[], skipped: string[] }} ensured
 * @returns {string}
 */
function companionSummary(base, ensured) {
  if (ensured.started.length === 0 && ensured.skipped.length === 0) return base;
  const parts = [];
  if (ensured.started.length > 0) parts.push(`已启动 ${ensured.started.join('、')}`);
  if (ensured.skipped.length > 0) parts.push(`已在运行 ${ensured.skipped.join('、')}`);
  return `${base}；伴随服务：${parts.join('，')}`;
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

  const projectLog = createProjectLogger(project.id);
  const companions = companionsOf(project);
  const ports = portsOf(project);

  // 主服务已在运行：不重复拉起，只补齐缺失的伴随服务。
  // 这是"共同启停"的关键路径——主服务在、bot 掉线时点一次启动就能补齐。
  const mainOpen = await firstOpenPort(ports);
  if (mainOpen) {
    const ensured = await ensureCompanions(project, companions, projectLog);
    rt.phase = 'running';
    if (!ensured.ok) {
      rt.lastError = ensured.message;
      return {
        ok: false,
        message: `主服务已在运行（端口 ${mainOpen}），但${ensured.message}`,
        pid: rt.pid,
      };
    }
    rt.lastError = null;
    return {
      ok: true,
      message: companionSummary(`已在运行（端口 ${mainOpen}）`, ensured),
      pid: rt.pid,
    };
  }

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
    env: project.start.env ? { ...process.env, ...project.start.env } : undefined,
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
  // 等待就绪。日志匹配最快，但 Windows 上 detached 子进程会丢掉 stdout，
  // 日志可能永远不出现（表现为卡片一直"处理中"直到超时），
  // 因此等待期间每 500ms 轮询一次端口，端口一通立即判定就绪。
  let readyHow = null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await Promise.race([readyPromise, sleep(500).then(() => 'tick')]);
    if (hit === 'log') {
      readyHow = '日志匹配就绪';
      break;
    }
    if (ports.length > 0) {
      const openPort = await firstOpenPort(ports);
      if (openPort) {
        projectLog.write(`[info] 端口 ${openPort} 已就绪，判定为启动成功`);
        readyHow = `端口 ${openPort} 就绪`;
        break;
      }
    } else if (rt.launcherExited) {
      // 无端口项目（桌面程序、CLI）无法用端口验证，只能信任"启动器正常退出"
      projectLog.write('[info] 启动器已退出且无端口可探测，判定为启动成功');
      readyHow = '启动器已退出';
      break;
    }
  }

  if (!readyHow) {
    rt.phase = 'failed';
    rt.lastError = rt.launcherExited
      ? '启动器已退出，但服务端口未就绪'
      : `启动超时（${timeoutMs}ms）且端口未就绪`;
    projectLog.write(`[error] ${rt.lastError}`);
    return { ok: false, message: rt.lastError };
  }

  // 旧机制：主服务就绪后尽力拉起附加命令，不校验结果
  runAfterReady(project);

  // 伴随服务：带端口就绪校验；required 的没起来则本次启动判失败
  const ensured = await ensureCompanions(project, companions, projectLog);
  rt.phase = 'running';
  if (!ensured.ok) {
    rt.lastError = ensured.message;
    return {
      ok: false,
      message: `主服务已启动（${readyHow}），但${ensured.message}`,
      pid: spawned.pid,
    };
  }

  rt.lastError = null;
  return {
    ok: true,
    message: companionSummary(`已启动（${readyHow}）`, ensured),
    pid: spawned.pid,
  };
}

/**
 * 轮询等待 PID 真正退出；返回超时后仍存活的 PID。
 *
 * taskkill 返回成功不等于句柄立刻释放：进程可能还要几十毫秒到几秒
 * 才从内核里消失，这段时间它仍然锁着 exe。
 *
 * @param {number[]} pids
 * @param {number} [timeoutMs]
 * @returns {Promise<number[]>}
 */
async function waitForPidsGone(pids, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let alive = pids.filter((p) => isPidAlive(p));
  while (alive.length > 0 && Date.now() < deadline) {
    await sleep(200);
    alive = alive.filter((p) => isPidAlive(p));
  }
  return alive;
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
      // 覆盖主服务、子服务、伴随服务与 stop 声明的全部端口
      const ports = stopPortsOf(project);
      targets = await pidsOnPorts(ports);

      // 端口只能定位到真正监听的服务进程；有些项目还有一层包装器/伴随进程
      // （如 OpenViking 的 openviking-server.exe 和 vikingbot.exe），
      // 它们会锁住 exe，导致 pip/覆盖更新失败。这里一并回收。
      const extraImages = [
        ...(project.stop?.imageName ? [project.stop.imageName] : []),
        ...(Array.isArray(project.stop?.imageNames) ? project.stop.imageNames : []),
      ];
      for (const image of extraImages) {
        targets.push(...(await pidsByImageName(image)));
      }
      targets = [...new Set(targets)];
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
      // 强杀不代表进程真的退出：Session 0 / 受保护进程会拒绝访问，
      // 进程继续锁着 exe，后续 pip/覆盖更新必然撞 WinError 32。
      // 必须复核；没死就明确失败，让更新在动手前中止，而不是把包卸坏。
      const stubborn = await waitForPidsGone(stillAlive, 2000);
      if (stubborn.length > 0) {
        rt.phase = 'idle';
        rt.lastError = `进程仍在运行（PID ${stubborn.join(', ')}）`;
        return {
          ok: false,
          message: `停止失败：进程仍在运行（PID ${stubborn.join(', ')}），可能权限不足（Session 0 或受保护进程）。为避免更新/覆盖损坏文件，已中止。`,
          killedPids: targets,
        };
      }
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

  // 等待停止集合里的全部端口释放：伴随服务（如 vikingbot 的 18790）
  // 没释放就重启，会让新拉起的伴随服务撞端口。
  const ports = stopPortsOf(project);
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
