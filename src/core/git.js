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
 * @param {string} dir
 * @param {string} remote
 * @param {string} branch
 * @returns {Promise<{ ok: boolean, output: string, error: string|null, alreadyUpToDate: boolean }>}
 */
export async function pullFastForwardOnly(dir, remote, branch) {
  const r = await exec('git', ['pull', '--ff-only', remote, branch], {
    cwd: dir,
    timeoutMs: 180000,
  });
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
