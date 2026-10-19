/**
 * 更新逻辑：git pull / fork 同步 / 克隆式更新。
 *
 * 三条铁律：
 *   1. 只允许 fast-forward（--ff-only）——本地有未推送提交时明确失败并报告，
 *      不悄悄生成 merge commit。用户看到提示后自己决定，比自动 merge 安全。
 *   2. 脏工作区自动 stash 而不是拒绝——从 GitHub 下载的项目几乎都带未提交改动，
 *      一律拒绝会让"点一下更新"变成不可能。暂存后更新，成功后恢复，任何失败
 *      路径都回滚，工作区必定回到原状（绝不丢用户的改动）。
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
  resetToRemote,
  stashPush,
  stashPop,
  initEmptyRepo,
  hasCommits,
  ensureRemote,
} from './git.js';
import { logger } from '../util/logger.js';

/**
 * @typedef {Object} UpdateResult
 * @property {boolean} ok
 * @property {string} message
 * @property {string} [output]
 * @property {boolean} [alreadyUpToDate]
 * @property {boolean} [stashed] 是否自动暂存过本地改动
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

  const remote = project.update.remote ?? 'origin';
  const branch = project.update.branch ?? 'main';
  const repoUrl = project.update.repoUrl;

  // —— git-clone：本地不是仓库，但有上游地址 ——
  // 典型场景：从 GitHub 下载 zip 解压使用。本地有凭据/配置不想删。
  // 做法：建一个空仓库 → 配好 remote → 走下面的自动 stash + 对齐上游流程。
  // 刻意不把本地文件做成首个提交：那样它们会变成已跟踪状态，
  // 之后的 reset --hard 会直接删掉它们。保持未跟踪才能被 stash 保护。
  if (strategy === 'git-clone') {
    if (!repoUrl) {
      return { ok: false, message: '配置了 git-clone 但缺少 update.repoUrl（上游仓库地址）' };
    }
    if (!(await isGitRepo(project.path))) {
      logger.info('非 git 仓库，转为克隆式更新：建立空仓库', { id: project.id });
      const initR = await initEmptyRepo(project.path, branch);
      if (!initR.ok) {
        return { ok: false, message: `初始化本地仓库失败：${initR.error}` };
      }
    }
    const r = await ensureRemote(project.path, remote, repoUrl);
    if (!r.ok) {
      return { ok: false, message: `配置 remote 失败：${r.error}` };
    }
    // 建库后按普通 git 流程继续，但标记 allowUnrelated：
    // 空仓库与上游没有共同祖先，ff-only 不可能成功，需走对齐分支。
    return updateProject({
      ...project,
      update: { ...project.update, strategy: 'git', allowUnrelated: true },
    });
  }

  // —— 前置检查 1：确实是 git 仓库 ——
  if (!(await isGitRepo(project.path))) {
    return { ok: false, message: '不是 git 仓库' };
  }

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

  // —— 前置检查 5：fork 同步需要 upstream 已配置 ——
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
  // 从 GitHub 下载的项目几乎都带未提交改动（编辑器配置、本地脚本、构建产物），
  // 一律拒绝会让"点一下更新"变成不可能。所以改为自动暂存：
  //   更新前暂存 → 更新成功后恢复 → 任何失败路径都回滚恢复。
  // 用户零操作就能更新，且任何一步出错工作区都回到原状。
  let stashed = false;
  /** 暂存的改动是否已被消费（成功恢复或已回滚）。finally 靠它避免重复弹用户的 stash */
  let stashConsumed = false;

  const dirty = await isDirty(project.path);
  const allowUnrelated = project.update.allowUnrelated ?? false;

  // 空仓库（git-clone 刚建、还没有任何 commit）不能 stash：
  // git 会报 "You do not have the initial commit yet"。
  // 此时本地文件必然全是未跟踪的，直接对齐上游即可——reset --hard 不碰未跟踪文件。
  // unborn 分支上没有 origin/<branch> 引用，必须先 fetch，失败再退到 FETCH_HEAD。
  if (dirty && allowUnrelated && !(await hasCommits(project.path))) {
    const fetched = await fetch(project.path, remote);
    if (!fetched.ok) {
      return { ok: false, message: `git fetch 失败：${fetched.stderr || '未知错误'}` };
    }

    const aligned = await resetToRemote(project.path, remote, branch);
    if (!aligned.ok) {
      return { ok: false, message: `与上游汇合失败：${aligned.error}`, output: aligned.output };
    }

    return {
      ok: true,
      message: '已与上游汇合（本地未跟踪文件原样保留）',
      output: aligned.output,
      alreadyUpToDate: false,
      stashed: false,
    };
  }

  if (dirty) {
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

    // 允许无共同历史时（git-clone 已入库但 upstream 无共同祖先）：
    // ff-only 必然失败，直接对齐到上游最新。本地改动已在之前的 stash 里，对齐后恢复。
    if (allowUnrelated) {
      const aligned = await resetToRemote(project.path, remote, branch);
      if (!aligned.ok) {
        return {
          ok: false,
          message: `与上游汇合失败：${aligned.error}`,
          output: aligned.output,
        };
      }
      const restored = await restoreStash(project.path, stashed);
      stashConsumed = true;
      return {
        ok: true,
        message: stashed ? '已与上游汇合（本地改动已恢复）' : '已与上游汇合',
        output: aligned.output,
        alreadyUpToDate: false,
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
