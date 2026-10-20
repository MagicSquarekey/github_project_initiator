/**
 * 更新逻辑：git pull / fork 同步。
 *
 * 本管理器的定位是**启动器**：对被管项目只做"看状态、启停、按用户指令拉更新"，
 * 绝不改动项目本身——不在项目目录里 git init、不新增文件、不改配置。
 * 因此更新只对"本来就是 git 仓库"的项目生效；非仓库项目一律标记为手动更新。
 *
 * 三条铁律：
 *   1. 只允许 fast-forward（--ff-only）——本地有未推送提交时明确失败并报告，
 *      不悄悄生成 merge commit。用户看到提示后自己决定，比自动 merge 安全。
 *   2. 脏工作区自动 stash 而不是拒绝——GitHub 项目几乎都带未提交改动
 *      （编辑器配置、本地脚本、构建产物），一律拒绝会让"点一下更新"变成不可能。
 *      暂存后更新，成功后恢复，任何失败路径都回滚，工作区必定回到原状。
 *   3. 冲突立即 abort——绝不自动解冲突，绝不留半合并状态。
 */

import {
  isGitRepo,
  currentBranch,
  isDirty,
  remotes,
  fetch,
  pullFastForwardOnly,
  mergeUpstream,
  stashPush,
  stashPop,
} from './git.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from '../util/exec.js';
import { logger } from '../util/logger.js';
import { probeProject } from './probe.js';
import { stopProject, startProject } from './process.js';
import { detectVersion, recordVersion, clearVersionCache } from './version.js';
import {
  fetchLatestRelease,
  downloadFile,
  verifyChecksum,
  extractZip,
  contentRoot,
  findFile,
  applyOverlay,
  replaceBinary,
  restoreBackup,
  globMatch,
} from './release.js';
import { ROOT } from './registry.js';

/**
 * @typedef {Object} UpdateResult
 * @property {boolean} ok
 * @property {string} message
 * @property {string} [output]
 * @property {boolean} [alreadyUpToDate]
 * @property {boolean} [stashed] 是否自动暂存过本地改动
 * @property {boolean} [stashRestored] 暂存的改动是否已恢复
 * @property {string} [backup] 非 git 更新的备份目录
 * @property {string} [fromVersion]
 * @property {string} [toVersion]
 */

/**
 * @returns {string}
 */
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * @param {any} project
 * @returns {string}
 */
function backupDirFor(project) {
  const base = process.env.GPI_BACKUP_DIR || path.join(ROOT, 'data', 'backups');
  const dir = path.join(base, `${project.id}-${timestamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * @param {any} project
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function tryStart(project) {
  try {
    return await startProject(project);
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function versionsEqual(a, b) {
  const norm = (v) => String(v).trim().replace(/^v/i, '');
  return norm(a) === norm(b);
}

/**
 * command 策略：执行项目自己的升级命令（如 pip install -U）。
 *
 * @param {any} project
 * @returns {Promise<UpdateResult>}
 */
async function updateByCommand(project) {
  const cfg = project.update ?? {};
  const timeoutMs = Number.isInteger(cfg.timeoutMs) ? cfg.timeoutMs : 300000;
  let stopped = false;

  try {
    const wasRunning = (await probeProject(project)).running;
    if (wasRunning && cfg.stopBefore === true) {
      const r = await stopProject(project);
      if (!r.ok) return { ok: false, message: `更新前停止失败：${r.message}` };
      stopped = true;
    }

    const r = await exec(cfg.command, Array.isArray(cfg.args) ? cfg.args : [], {
      cwd: project.path,
      timeoutMs,
    });
    const output = `${r.stdout}\n${r.stderr}`.trim();

    if (!r.ok) {
      if (stopped) await tryStart(project);
      return { ok: false, message: `更新命令失败：${r.error}`, output };
    }

    clearVersionCache();
    let started = false;
    if (stopped && cfg.startAfter === true) {
      const s = await startProject(project);
      started = s.ok;
      if (!s.ok) {
        return { ok: false, message: `更新完成但启动失败：${s.message}`, output, started: false };
      }
    }

    return { ok: true, message: '更新命令执行完成', output, stopped, started };
  } catch (err) {
    if (stopped) await tryStart(project);
    return { ok: false, message: `更新失败：${err.message}` };
  }
}

/**
 * release 策略：从 GitHub 最新 Release 下载资产，校验后覆盖。
 *
 * 安全顺序：下载 → 校验 → 解压 → 预检目标 → 停服务 → 备份 → 覆盖 → 启动。
 * 任何一步失败都回滚；启动失败也会回滚并尝试拉起旧版本。
 *
 * @param {any} project
 * @returns {Promise<UpdateResult>}
 */
async function updateByRelease(project) {
  const cfg = project.update ?? {};
  const timeoutMs = Number.isInteger(cfg.timeoutMs) ? cfg.timeoutMs : 300000;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gpi-update-'));
  let stopped = false;
  let backupDir = null;

  try {
    const latest = await fetchLatestRelease(cfg.repo, 30000);
    const tag = String(latest.tag_name ?? '');
    if (!tag) throw new Error('最新 Release 没有 tag_name');
    const toVersion = tag.replace(/^v/i, '');
    const current = await detectVersion(project);

    if (current && versionsEqual(current, toVersion)) {
      return { ok: true, message: `已是最新（${current}）`, alreadyUpToDate: true, toVersion };
    }

    let asset;
    if (cfg.mode === 'binary') {
      if (!cfg.asset) throw new Error('mode=binary 需要配置 update.asset');
      asset = (latest.assets ?? []).find((a) => globMatch(cfg.asset, a.name));
      if (!asset) throw new Error(`Release ${tag} 没有匹配 ${cfg.asset} 的资产`);
    } else if (cfg.asset) {
      asset = (latest.assets ?? []).find((a) => globMatch(cfg.asset, a.name));
      if (!asset) throw new Error(`Release ${tag} 没有匹配 ${cfg.asset} 的资产`);
    } else {
      const url = latest.zipball_url ?? `https://github.com/${cfg.repo}/archive/refs/tags/${tag}.zip`;
      asset = { name: `${cfg.repo.replace('/', '-')}-${tag}.zip`, browser_download_url: url };
    }

    const zipPath = path.join(work, 'asset.zip');
    await downloadFile(asset.browser_download_url, zipPath, timeoutMs);

    if (cfg.checksums) {
      const sums = (latest.assets ?? []).find((a) => a.name === cfg.checksums);
      if (!sums) throw new Error(`Release ${tag} 没有 ${cfg.checksums}`);
      const sumsPath = path.join(work, cfg.checksums);
      await downloadFile(sums.browser_download_url, sumsPath, 60000);
      verifyChecksum(zipPath, fs.readFileSync(sumsPath, 'utf8'), asset.name);
    }

    const extractDir = path.join(work, 'extract');
    extractZip(zipPath, extractDir);
    const root = contentRoot(extractDir, Number.isInteger(cfg.stripComponents) ? cfg.stripComponents : 0);

    let binarySource = null;
    if (cfg.mode === 'binary') {
      binarySource = findFile(root, cfg.target);
      if (!binarySource) throw new Error(`更新包中找不到 ${cfg.target}`);
    }

    // —— 所有下载/校验/解压完成后再停服务 ——
    const wasRunning = (await probeProject(project)).running;
    if (wasRunning && cfg.stopBefore === true) {
      const r = await stopProject(project);
      if (!r.ok) throw new Error(`更新前停止失败：${r.message}`);
      stopped = true;
    }

    backupDir = backupDirFor(project);
    if (cfg.mode === 'binary') {
      replaceBinary(binarySource, path.join(project.path, cfg.target), backupDir, cfg.target);
    } else {
      applyOverlay(root, project.path, cfg.preserve ?? [], backupDir);
    }

    recordVersion(project.id, toVersion);
    clearVersionCache();

    let started = false;
    if (stopped && cfg.startAfter === true) {
      const s = await startProject(project);
      started = s.ok;
      if (!s.ok) {
        restoreBackup(project.path, backupDir);
        const old = await tryStart(project);
        return {
          ok: false,
          message: `更新到 ${tag} 后启动失败，已回滚：${s.message}${old.ok ? '（旧版本已重新启动）' : ''}`,
          backup: backupDir,
        };
      }
    }

    return {
      ok: true,
      message: `已更新到 ${tag}${current ? `（原 ${current}）` : ''}`,
      fromVersion: current,
      toVersion,
      backup: backupDir,
      stopped,
      started,
    };
  } catch (err) {
    if (backupDir) {
      try {
        restoreBackup(project.path, backupDir);
      } catch {
        // 回滚尽力而为，错误信息里保留原始失败原因
      }
    }
    if (stopped) await tryStart(project);
    return {
      ok: false,
      message: `更新失败${backupDir ? '，已回滚' : ''}：${err.message}`,
      backup: backupDir,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * 更新单个项目。
 *
 * @param {any} project registry 条目
 * @returns {Promise<UpdateResult>}
 */
export async function updateProject(project) {
  const strategy = project.update?.strategy ?? 'none';

  if (strategy === 'command') return updateByCommand(project);
  if (strategy === 'release') return updateByRelease(project);

  if (strategy === 'none') {
    return {
      ok: false,
      message: '该项目未纳入 git 管理（非仓库或已标记为手动更新），请自行更新',
    };
  }

  // —— 前置检查 1：确实是 git 仓库 ——
  // 启动器边界：绝不为"让它可更新"而把非仓库目录变成仓库（git init 属于改动项目本身）。
  if (!(await isGitRepo(project.path))) {
    return { ok: false, message: '不是 git 仓库' };
  }

  const remote = project.update.remote ?? 'origin';
  const branch = project.update.branch ?? 'main';

  // —— 前置检查 2：不在 detached HEAD ——
  const current = await currentBranch(project.path);
  if (current === null) {
    return {
      ok: false,
      message: '处于 detached HEAD 状态，拒绝更新。请先切回分支。',
    };
  }

  // —— 前置检查 3：分支与配置一致 ——
  if (current !== branch) {
    return {
      ok: false,
      message: `当前分支是 "${current}"，配置期望 "${branch}"。请切换分支或修改 registry 中的 branch 配置。`,
    };
  }

  // —— 前置检查 4：remote 已配置 ——
  // 注意：所有可能在 stash 之前失败的检查都必须排在 stash 之前。
  // 一旦 stash 了工作区，任何提前 return 都得先把 stash 弹回去，
  // 否则用户的未提交改动会凭空"消失"（藏在 stash 里），这是不可接受的数据安全问题。
  const availableRemotes = await remotes(project.path);
  const upstream = project.update.upstream ?? 'upstream';

  if (strategy === 'git-fork') {
    if (!availableRemotes.includes(upstream)) {
      return {
        ok: false,
        message: `配置了 fork 同步，但没有名为 "${upstream}" 的 remote。请先执行：git remote add ${upstream} <上游仓库地址>`,
      };
    }
    if (!availableRemotes.includes(remote)) {
      return { ok: false, message: `没有名为 "${remote}" 的 remote` };
    }
  } else if (!availableRemotes.includes(remote)) {
    return { ok: false, message: `没有名为 "${remote}" 的 remote` };
  }

  // —— 工作区处理：自动 stash ——
  // 暂存 → 更新 → 恢复；任何失败路径都回滚。stash pop 成功后不留任何痕迹，
  // 失败时改动仍安全保留在 stash 里，绝不丢。
  let stashed = false;
  /** 暂存的改动是否已被消费（成功恢复或已回滚）。finally 靠它避免重复弹用户的 stash */
  let stashConsumed = false;

  if (await isDirty(project.path)) {
    const push = await stashPush(project.path);
    if (!push.ok) {
      return {
        ok: false,
        message: `工作区有未提交改动且自动暂存失败：${push.error}。请手动 git stash 后重试。`,
      };
    }
    stashed = true;
    logger.info('已自动暂存本地改动', { id: project.id });
  }

  // 从这里开始的任何失败都必须回滚 stash。用 try/finally 兜住所有漏网路径。
  try {
    // —— fetch ——
    const fetched = await fetch(project.path, remote);
    if (!fetched.ok) {
      return { ok: false, message: `git fetch 失败：${fetched.stderr || '未知错误'}` };
    }

    if (strategy === 'git-fork') {
      const fetchedUp = await fetch(project.path, upstream);
      if (!fetchedUp.ok) {
        return { ok: false, message: `git fetch ${upstream} 失败：${fetchedUp.stderr || '未知错误'}` };
      }
      const merged = await mergeUpstream(project.path, upstream, branch);
      if (!merged.ok) {
        return {
          ok: false,
          message: `合并上游失败（已自动 abort）：${merged.error}`,
          output: merged.output,
        };
      }
      const restored = await restoreStash(project.path, stashed);
      stashConsumed = true;   // 无论恢复成功还是冲突保留，都已处理过，别再弹
      return {
        ok: true,
        message: merged.alreadyUpToDate ? '已是最新（与上游无差异）' : '已同步上游更新',
        output: merged.output,
        alreadyUpToDate: merged.alreadyUpToDate,
        stashed,
        stashRestored: restored,
      };
    }

    const pulled = await pullFastForwardOnly(project.path, remote, branch);
    if (!pulled.ok) {
      return {
        ok: false,
        message: `更新失败：${pulled.error}`,
        output: pulled.output,
      };
    }
    const restored = await restoreStash(project.path, stashed);
    stashConsumed = true;
    return {
      ok: true,
      message: pulled.alreadyUpToDate ? '已是最新' : '已更新到最新',
      output: pulled.output,
      alreadyUpToDate: pulled.alreadyUpToDate,
      stashed,
      stashRestored: restored,
    };
  } finally {
    // 只在"暂存了但从未处理过"时回滚——即中途抛异常或提前 return 的失败路径。
    // 绝不能无条件 pop：用户自己可能有 stash，误弹会弄乱他的工作区。
    if (stashed && !stashConsumed) {
      await rollbackStash(project.path, true);
    }
  }
}

/**
 * 更新成功后恢复暂存的改动。
 *
 * 恢复本身也可能冲突（远程改动与本地改动改了同一处），此时保留 stash 不丢，
 * 让用户自行决定——绝不 drop 掉用户的未提交改动。
 *
 * @param {string} dir
 * @param {boolean} stashed
 * @returns {Promise<boolean>} 是否成功恢复
 */
async function restoreStash(dir, stashed) {
  if (!stashed) return false;
  const r = await stashPop(dir);
  if (r.ok) return true;
  logger.warn('stash 恢复冲突，已保留 stash', { dir, error: r.error });
  return false;
}

/**
 * 更新失败时回滚：撤销暂存，让工作区回到更新前的原状。
 *
 * @param {string} dir
 * @param {boolean} stashed
 */
async function rollbackStash(dir, stashed) {
  if (!stashed) return;
  const r = await stashPop(dir);
  if (r.ok) {
    logger.info('更新失败，已回滚暂存的改动', { dir });
    return;
  }
  // pop 失败：不 drop，stash 里还留着用户的改动
  logger.warn('回滚 stash 失败，改动仍保留在 stash 中', { dir, error: r.error });
}
