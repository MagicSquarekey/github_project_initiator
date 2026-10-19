/**
 * 更新逻辑：git pull / fork 同步。
 *
 * 三条铁律：
 *   1. 只允许 fast-forward（--ff-only）——本地有未推送提交时明确失败并报告，
 *      不悄悄生成 merge commit。用户看到提示后自己决定，比自动 merge 安全。
 *   2. 脏工作区一律拒绝——避免 pull 把用户的未提交改动卷进冲突里。
 *   3. 冲突立即 abort——绝不自动解冲突，绝不留半合并状态。
 */

import {
  isGitRepo,
  currentBranch,
  isDirty,
  dirtyFiles,
  remotes,
  fetch,
  pullFastForwardOnly,
  mergeUpstream,
} from './git.js';
import { logger } from '../util/logger.js';

/**
 * @typedef {Object} UpdateResult
 * @property {boolean} ok
 * @property {string} message
 * @property {string} [output]
 * @property {boolean} [alreadyUpToDate]
 */

/**
 * 更新单个项目。
 *
 * @param {any} project registry 条目
 * @returns {Promise<UpdateResult>}
 */
export async function updateProject(project) {
  const strategy = project.update?.strategy ?? 'none';

  if (strategy === 'none') {
    return {
      ok: false,
      message: '该项目未纳入 git 管理（非仓库或已标记为手动更新），请自行更新',
    };
  }

  // —— 前置检查 1：确实是 git 仓库 ——
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

  // —— 前置检查 4：工作区干净 ——
  if (await isDirty(project.path)) {
    const files = await dirtyFiles(project.path);
    return {
      ok: false,
      message: `工作区有未提交改动，拒绝更新（共 ${files.length} 项，如：${files.slice(0, 3).join(' | ')}）。请先提交或 stash。`,
    };
  }

  // —— 前置检查 5：fork 同步需要 upstream 已配置 ——
  const availableRemotes = await remotes(project.path);
  if (strategy === 'git-fork') {
    const upstream = project.update.upstream ?? 'upstream';
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

  // —— fetch ——
  const fetched = await fetch(project.path, remote);
  if (!fetched.ok) {
    return { ok: false, message: `git fetch 失败：${fetched.stderr || '未知错误'}` };
  }

  if (strategy === 'git-fork') {
    const upstream = project.update.upstream ?? 'upstream';
    const fetchedUp = await fetch(project.path, upstream);
    if (!fetchedUp.ok) {
      return { ok: false, message: `git fetch ${upstream} 失败：${fetchedUp.stderr || '未知错误'}` };
    }
    const merged = await mergeUpstream(project.path, upstream, branch);
    return {
      ok: merged.ok,
      message: merged.ok
        ? merged.alreadyUpToDate
          ? '已是最新（与上游无差异）'
          : '已同步上游更新'
        : `合并上游失败（已自动 abort，工作区未受影响）：${merged.error}`,
      output: merged.output,
      alreadyUpToDate: merged.alreadyUpToDate,
    };
  }

  const pulled = await pullFastForwardOnly(project.path, remote, branch);
  return {
    ok: pulled.ok,
    message: pulled.ok
      ? pulled.alreadyUpToDate
        ? '已是最新'
        : '已更新到最新'
      : `更新失败：${pulled.error}`,
    output: pulled.output,
    alreadyUpToDate: pulled.alreadyUpToDate,
  };
}
