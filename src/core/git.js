/**
 * git 命令封装。
 *
 * 所有命令都通过 exec 跑在项目自己的 cwd 下，不 chdir 进程工作目录
 * ——管理器是单进程常驻的，chdir 会影响其他所有相对路径解析。
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec } from '../util/exec.js';

/**
 * 目录是否是 git 仓库。
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function isGitRepo(dir) {
  const r = await exec('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, timeoutMs: 8000 });
  return r.ok && r.stdout.trim() === 'true';
}

/**
 * 当前分支名；detached HEAD 时返回 null。
 *
 * @param {string} dir
 * @returns {Promise<string|null>}
 */
export async function currentBranch(dir) {
  const r = await exec('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    cwd: dir,
    timeoutMs: 8000,
  });
  return r.ok ? r.stdout.trim() : null;
}

/**
 * 工作区是否有未提交改动。
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function isDirty(dir) {
  const r = await exec('git', ['status', '--porcelain'], { cwd: dir, timeoutMs: 15000 });
  return r.ok && r.stdout.trim().length > 0;
}

/**
 * 取工作区改动明细（用于提示用户更新为什么被拒绝）。
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function dirtyFiles(dir) {
  const r = await exec('git', ['status', '--porcelain'], { cwd: dir, timeoutMs: 15000 });
  if (!r.ok) return [];
  return r.stdout.split(/\r?\n/).filter(Boolean).slice(0, 10);
}

/**
 * 本地是否落后于上游。返回 null 表示无法判定（无上游等）。
 *
 * @param {string} dir
 * @returns {Promise<number|null>} 落后提交数
 */
export async function behindCount(dir) {
  const r = await exec('git', ['rev-list', '--count', 'HEAD..@{upstream}'], {
    cwd: dir,
    timeoutMs: 15000,
  });
  if (!r.ok) return null;
  const n = Number.parseInt(r.stdout.trim(), 10);
  return Number.isInteger(n) ? n : null;
}

/**
 * 本地领先的提交数（有未推送的提交）。
 *
 * @param {string} dir
 * @returns {Promise<number|null>}
 */
export async function aheadCount(dir) {
  const r = await exec('git', ['rev-list', '--count', '@{upstream}..HEAD'], {
    cwd: dir,
    timeoutMs: 15000,
  });
  if (!r.ok) return null;
  const n = Number.parseInt(r.stdout.trim(), 10);
  return Number.isInteger(n) ? n : null;
}

/**
 * 最新提交的短 SHA 与标题。
 *
 * @param {string} dir
 * @returns {Promise<{ sha: string, subject: string }|null>}
 */
export async function headCommit(dir) {
  const r = await exec('git', ['log', '-1', '--format=%h%x09%s'], { cwd: dir, timeoutMs: 10000 });
  if (!r.ok) return null;
  const [sha, subject] = r.stdout.trim().split('\t');
  return sha ? { sha, subject: subject ?? '' } : null;
}

/**
 * 取 remote 列表（判断 fork 的上游是否已配置）。
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function remotes(dir) {
  const r = await exec('git', ['remote'], { cwd: dir, timeoutMs: 8000 });
  return r.ok ? r.stdout.split(/\r?\n/).filter(Boolean) : [];
}

/**
 * git fetch（单一 remote）。
 *
 * @param {string} dir
 * @param {string} remote
 * @returns {Promise<{ ok: boolean, stderr: string }>}
 */
export async function fetch(dir, remote) {
  const r = await exec('git', ['fetch', remote, '--tags', '--prune'], {
    cwd: dir,
    timeoutMs: 120000,
  });
  return { ok: r.ok, stderr: r.stderr, stdout: r.stdout };
}

/**
 * 快进式拉取：只允许 fast-forward。
 *
 * 为什么不用普通 pull：--ff-only 保证本地有未推送提交时明确失败并报告，
 * 而不是悄悄生成一个 merge commit。用户看到冲突提示后自己决定，比自动 merge 安全。
 *
 * allowUnrelated：本地仓库由"解压 zip + 首次提交"产生时，与上游没有共同祖先，
 * 必须加 --allow-unrelated-histories 才能合。此时已由 stash 保证工作区干净。
 *
 * @param {string} dir
 * @param {string} remote
 * @param {string} branch
 * @param {{ allowUnrelated?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, output: string, error: string|null, alreadyUpToDate: boolean }>}
 */
export async function pullFastForwardOnly(dir, remote, branch, options = {}) {
  const args = ['pull', '--ff-only'];
  if (options.allowUnrelated) args.push('--allow-unrelated-histories');
  args.push(remote, branch);

  const r = await exec('git', args, { cwd: dir, timeoutMs: 180000 });
  const output = `${r.stdout}\n${r.stderr}`.trim();
  return {
    ok: r.ok,
    output,
    error: r.ok ? null : (r.error || r.stderr || r.stdout),
    alreadyUpToDate: /Already up to date/i.test(output),
  };
}

/**
 * fork 同步：合并上游分支。
 *
 * 冲突时立即 abort 并报告，绝不自动解冲突。
 *
 * @param {string} dir
 * @param {string} upstreamRemote
 * @param {string} branch
 * @returns {Promise<{ ok: boolean, output: string, error: string|null, alreadyUpToDate: boolean }>}
 */
export async function mergeUpstream(dir, upstreamRemote, branch) {
  const r = await exec('git', ['merge', '--no-edit', `${upstreamRemote}/${branch}`], {
    cwd: dir,
    timeoutMs: 180000,
  });

  if (!r.ok) {
    // 无论什么原因失败，先 abort 把工作区恢复干净，避免留下半合并状态
    await exec('git', ['merge', '--abort'], { cwd: dir, timeoutMs: 30000 });
    return {
      ok: false,
      output: `${r.stdout}\n${r.stderr}`.trim(),
      error: r.stderr || r.stdout || '合并失败',
      alreadyUpToDate: false,
    };
  }

  const output = `${r.stdout}\n${r.stderr}`.trim();
  return {
    ok: true,
    output,
    error: null,
    alreadyUpToDate: /Already up to date/i.test(output),
  };
}

/**
 * 初始化一个空的 git 仓库并建立分支（不提交任何文件）。
 *
 * 用于 git-clone 的首次准备：必须先有仓库才能配置 remote、才能 stash。
 * 刻意不 add/commit 本地文件——本地内容保持"未跟踪"状态，
 * 这样后续 stash --include-untracked 能把它们完整保护起来，
 * 避免被 reset --hard 清掉。已跟踪的上游文件则由 reset 负责对齐。
 *
 * @param {string} dir
 * @param {string} branch
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function initEmptyRepo(dir, branch = 'main') {
  // git init -b <name> 需要 2.28+；老版本退到 init.defaultBranch
  let r = await exec('git', ['init', '--quiet', '-b', branch], { cwd: dir, timeoutMs: 30000 });
  if (!r.ok) {
    r = await exec('git', ['-c', `init.defaultBranch=${branch}`, 'init', '--quiet'], {
      cwd: dir,
      timeoutMs: 30000,
    });
    if (!r.ok) return { ok: false, error: r.stderr || r.stdout || 'git init 失败' };
  }

  // 保险：确认分支名（老版本 git 可能建成 master）
  const cur = await currentBranch(dir);
  if (cur !== branch) {
    await exec('git', ['checkout', '-b', branch], { cwd: dir, timeoutMs: 15000 });
  }
  return { ok: true, error: null };
}

/**
 * 在已有文件的目录里初始化 git 仓库，并把当前内容作为首个提交。
 *
 * 用途：明确需要一个"本地快照提交"时使用。注意这会让本地文件变成已跟踪状态，
 * 之后 reset --hard 会丢弃它们——只在确实想保留快照进历史时用。
 *
 * @param {string} dir
 * @param {string} branch
 * @param {string} [message]
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function initAndCommitExisting(dir, branch = 'main', message = 'gpi: initial snapshot') {
  const initR = await initEmptyRepo(dir, branch);
  if (!initR.ok) return initR;

  const env = ['-c', 'user.email=gpi@local', '-c', 'user.name=gpi'];
  const add = await exec('git', [...env, 'add', '-A'], { cwd: dir, timeoutMs: 180000 });
  if (!add.ok && !/nothing|no files|paths did not match/i.test(`${add.stdout}${add.stderr}`)) {
    return { ok: false, error: add.stderr || add.stdout || 'git add 失败' };
  }

  const commit = await exec('git', [...env, 'commit', '--quiet', '-m', message], {
    cwd: dir,
    timeoutMs: 180000,
  });
  if (!commit.ok && !/nothing to commit|no changes added/i.test(`${commit.stdout}${commit.stderr}`)) {
    return { ok: false, error: commit.stderr || commit.stdout || 'git commit 失败' };
  }

  return { ok: true, error: null };
}

/**
 * 添加一个 remote（已存在则先移除再加，保证指向最新地址）。
 *
 * @param {string} dir
 * @param {string} name
 * @param {string} url
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function ensureRemote(dir, name, url) {
  const rm = await exec('git', ['remote', 'remove', name], { cwd: dir, timeoutMs: 15000 });
  void rm; // 不存在时失败，无所谓
  const add = await exec('git', ['remote', 'add', name, url], { cwd: dir, timeoutMs: 15000 });
  return { ok: add.ok, error: add.ok ? null : (add.stderr || add.stdout) };
}

/**
 * 把工作区改动暂存起来。
 *
 * --include-untracked 很关键：GitHub 下载的项目最常见的未提交改动就是
 * 新增的未跟踪文件（本地脚本、编辑器配置、构建产物）。不含它这些文件会挡住 pull。
 *
 * @param {string} dir
 * @returns {Promise<{ ok: boolean, error: string|null, ref?: string }>}
 */
export async function stashPush(dir) {
  const r = await exec('git', ['stash', 'push', '--include-untracked', '-m', 'gpi-auto-update'], {
    cwd: dir,
    timeoutMs: 60000,
  });
  // "No local changes to save" 视为成功：没有东西可暂存
  if (!r.ok && /No local changes to save/i.test(r.stderr)) {
    return { ok: true, error: null };
  }
  return { ok: r.ok, error: r.ok ? null : (r.stderr || r.stdout) };
}

/**
 * 恢复最近一次 stash。
 *
 * @param {string} dir
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function stashPop(dir) {
  const r = await exec('git', ['stash', 'pop'], { cwd: dir, timeoutMs: 60000 });
  // 没有 stash 可弹也算成功
  if (!r.ok && /No stash entries found/i.test(r.stderr)) {
    return { ok: true, error: null };
  }
  return { ok: r.ok, error: r.ok ? null : (r.stderr || r.stdout) };
}

/**
 * 丢弃最近的 stash。
 *
 * 仅在确认不再需要时调用——正常流程下不用它，避免丢掉用户的未提交改动。
 *
 * @param {string} dir
 * @returns {Promise<{ ok: boolean }>}
 */
export async function stashDrop(dir) {
  const r = await exec('git', ['stash', 'drop'], { cwd: dir, timeoutMs: 30000 });
  return { ok: r.ok };
}

/**
 * 仓库是否已有至少一个提交。
 *
 * 空仓库（刚 git init）不能 stash、不能 reset 到上游之外的很多东西，
 * 调用方需要先判断。用 rev-parse HEAD 的成败判定，比数 log 行更可靠。
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function hasCommits(dir) {
  const r = await exec('git', ['rev-parse', '--quiet', '--verify', 'HEAD'], {
    cwd: dir,
    timeoutMs: 10000,
  });
  return r.ok;
}

/**
 * 把本地仓库对齐到上游最新（reset --hard）。
 *
 * 用于"zip 解压 + 首次提交"与上游的汇合：本地那份快照往往就是上游某个旧版，
 * 逐文件 merge 会因 add/add 冲突而卡住（内容相同 git 也视为冲突）。
 * 直接对齐到上游更干净，之后就走正常的 ff-only 流程。
 *
 * 前提：调用方必须已经 stash 过本地改动，否则 reset --hard 会丢弃它们。
 * 本函数不自行 stash——由 update.js 统一管理暂存生命周期。
 *
 * unborn 分支（刚 init、还没有提交）上没有 origin/<branch> 引用，
 * 此时自动退到 FETCH_HEAD——调用方需先 fetch 过。
 *
 * @param {string} dir
 * @param {string} remote
 * @param {string} branch
 * @returns {Promise<{ ok: boolean, output: string, error: string|null }>}
 */
export async function resetToRemote(dir, remote, branch) {
  let r = await exec('git', ['reset', '--hard', `${remote}/${branch}`], {
    cwd: dir,
    timeoutMs: 120000,
  });

  // unborn 分支：origin/<branch> 尚不存在，改用 FETCH_HEAD
  if (!r.ok && /ambiguous argument|unknown revision/i.test(r.stderr)) {
    r = await exec('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: dir, timeoutMs: 120000 });
  }

  return {
    ok: r.ok,
    output: `${r.stdout}\n${r.stderr}`.trim(),
    error: r.ok ? null : (r.stderr || r.stdout || 'reset 失败'),
  };
}

/**
 * 采集项目的 git 状态快照（看板用）。
 *
 * @param {string} dir
 * @returns {Promise<{ isRepo: boolean, branch: string|null, dirty: boolean, behind: number|null, ahead: number|null, head: { sha: string, subject: string }|null, remotes: string[] }>}
 */
export async function gitSnapshot(dir) {
  const empty = {
    isRepo: false,
    branch: null,
    dirty: false,
    behind: null,
    ahead: null,
    head: null,
    remotes: [],
  };

  if (!fs.existsSync(path.join(dir, '.git'))) {
    // 没有 .git 目录就不必再跑命令了；.git 也可能是文件（worktree/submodule），
    // 那种情况下 rev-parse 仍能工作，所以这里只做存在性短路，不做类型判断。
    if (!fs.existsSync(dir)) return empty;
  }

  const repo = await isGitRepo(dir);
  if (!repo) return empty;

  const [branch, dirty, behind, ahead, head, remoteList] = await Promise.all([
    currentBranch(dir),
    isDirty(dir),
    behindCount(dir),
    aheadCount(dir),
    headCommit(dir),
    remotes(dir),
  ]);

  return { isRepo: true, branch, dirty, behind, ahead, head, remotes: remoteList };
}
