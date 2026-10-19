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
import { logger } from '../util/logger.js';

/**
 * @typedef {Object} UpdateResult
 * @property {boolean} ok
 * @property {string} message
 * @property {string} [output]
 * @property {boolean} [alreadyUpToDate]
 * @property {boolean} [stashed] 是否自动暂存过本地改动
 * @property {boolean} [stashRestored] 暂存的改动是否已恢复
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
