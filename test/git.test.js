/**
 * git 更新逻辑测试。
 *
 * 全部在临时目录里建真实 git 仓库跑真实命令，不碰 Desktop 上的项目。
 * 重点验证三条铁律：
 *   1. 只允许 fast-forward（本地有未推送提交时明确失败）
 *   2. 脏工作区一律拒绝
 *   3. 冲突立即 abort，不留半合并状态
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from '../src/util/exec.js';
import {
  isGitRepo, currentBranch, isDirty, behindCount, aheadCount,
  fetch, pullFastForwardOnly, mergeUpstream, gitSnapshot,
} from '../src/core/git.js';
import { updateProject } from '../src/core/update.js';

/** 建一个临时 git 仓库，返回路径；测试结束自动清理 */
async function makeRepo() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-test-'));
  const git = (args) => exec('git', args, { cwd: dir, timeoutMs: 20000 });
  // 隔离 git 配置：避免继承用户全局 config 导致行为不确定
  const env = ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];
  assert.ok((await git([...env, 'init', '--quiet'])).ok, 'git init 失败');
  await fs.promises.writeFile(path.join(dir, 'f.txt'), 'v1\n');
  await git([...env, 'add', '.']);
  await git([...env, 'commit', '--quiet', '-m', 'c1']);
  return dir;
}

/**
 * 建一个 bare 仓库当远端。
 *
 * 不能用仓库自身当 remote：git 会发现 src==dst 走本地快速路径，
 * "远程领先"这个场景根本构造不出来，pull 会恒返回 Already up to date。
 */
async function makeBare() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-bare-'));
  const r = await exec('git', ['init', '--quiet', '--bare', '-b', 'main', dir], { timeoutMs: 20000 });
  assert.ok(r.ok, `git init --bare 失败：${r.stderr}`);
  return dir;
}

/** 统一的 git 调用参数：隔离用户全局配置，默认分支固定为 main */
const GIT_ENV = ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false'];

/** 归一化行尾：Windows 的 git autocrlf 会把 \n 写成 \r\n，比较前统一 */
const norm = (s) => String(s).replace(/\r\n/g, '\n');

/**
 * 建一个工作区仓库并推到 bare，建立 origin 与 upstream 追踪。
 *
 * 用 clone 而非手工 remote add + checkout -b：clone 会自动建立
 * upstream 追踪关系，最贴近真实使用场景，也少一层易错的手工配置。
 */
async function makeRepoWithRemote() {
  const bare = await makeBare();

  // 先在 bare 里放一个初始提交（bare 仓库不能直接 commit，借一个临时工作区）
  const seed = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-seed-'));
  const seedGit = (args) => exec('git', [...GIT_ENV, ...args], { cwd: seed, timeoutMs: 20000 });
  assert.ok((await seedGit(['init', '--quiet', '-b', 'main'])).ok);
  await fs.promises.writeFile(path.join(seed, 'f.txt'), 'v1\n');
  await seedGit(['add', '.']);
  await seedGit(['commit', '--quiet', '-m', 'c1']);
  assert.ok((await seedGit(['remote', 'add', 'origin', bare])).ok);
  assert.ok((await seedGit(['push', '--quiet', '-u', 'origin', 'main'])).ok, 'seed push 失败');

  // 克隆出被测工作区
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-clone-'));
  const clone = await exec('git', [...GIT_ENV, 'clone', '--quiet', bare, dir], { timeoutMs: 30000 });
  assert.ok(clone.ok, `clone 失败：${clone.stderr}`);

  const git = (args) => exec('git', [...GIT_ENV, ...args], { cwd: dir, timeoutMs: 20000 });
  assert.ok((await git(['config', 'user.email', 't@t'])).ok);

  return { dir, bare, git };
}

/**
 * 往 bare 推送一个新提交，模拟"远程领先"。
 *
 * 借一个临时克隆完成，不影响被测工作区。
 *
 * @returns {Promise<void>}
 */
async function advanceRemote(bare, filename, content, message) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-push-'));
  const clone = await exec('git', [...GIT_ENV, 'clone', '--quiet', bare, tmp], { timeoutMs: 30000 });
  assert.ok(clone.ok, `advanceRemote clone 失败：${clone.stderr}`);
  const git = (args) => exec('git', [...GIT_ENV, ...args], { cwd: tmp, timeoutMs: 20000 });
  await fs.promises.writeFile(path.join(tmp, filename), content);
  await git(['add', '.']);
  await git(['commit', '--quiet', '-m', message]);
  assert.ok((await git(['push', '--quiet', 'origin', 'main'])).ok, 'advanceRemote push 失败');
}

test('isGitRepo 正确识别', async () => {
  const dir = await makeRepo();
  assert.equal(await isGitRepo(dir), true);

  const plain = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-plain-'));
  assert.equal(await isGitRepo(plain), false);
  assert.equal(await isGitRepo('/nonexistent-xyz'), false);
});

test('currentBranch 返回 main', async () => {
  const dir = await makeRepo();
  assert.equal(await currentBranch(dir), 'main');
});

test('脏工作区检测', async () => {
  const dir = await makeRepo();
  assert.equal(await isDirty(dir), false);
  await fs.promises.writeFile(path.join(dir, 'new.txt'), 'x\n');
  assert.equal(await isDirty(dir), true);
});

test('gitSnapshot 汇总', async () => {
  const dir = await makeRepo();
  const s = await gitSnapshot(dir);
  assert.equal(s.isRepo, true);
  assert.equal(s.branch, 'main');
  assert.equal(s.dirty, false);
  assert.ok(s.head?.sha);
});

test('gitSnapshot 对非仓库返回 isRepo=false', async () => {
  const plain = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-plain-'));
  const s = await gitSnapshot(plain);
  assert.equal(s.isRepo, false);
  assert.equal(s.branch, null);
});

test('behind/ahead 计数', async () => {
  const { dir, bare, git } = await makeRepoWithRemote();

  assert.equal(await behindCount(dir), 0);
  assert.equal(await aheadCount(dir), 0);

  // 远端推进一个提交 → 本地 behind 1
  await advanceRemote(bare, 'remote.txt', 'r\n', 'remote-c2');
  await git(['fetch', 'origin']);
  assert.equal(await behindCount(dir), 1, '本地应落后 1 个提交');

  // 本地再提交一个 → ahead 1, behind 1
  await fs.promises.writeFile(path.join(dir, 'f.txt'), 'v2\n');
  await git(['add', '.']);
  await git(['commit', '--quiet', '-m', 'c2']);
  assert.equal(await aheadCount(dir), 1);
  assert.equal(await behindCount(dir), 1);
});

test('pullFastForwardOnly 已是最新时成功', async () => {
  const { dir } = await makeRepoWithRemote();
  const r = await pullFastForwardOnly(dir, 'origin', 'main');
  assert.equal(r.ok, true);
  assert.equal(r.alreadyUpToDate, true);
});

test('远程领先时可快进更新', async () => {
  const { dir, bare } = await makeRepoWithRemote();
  await advanceRemote(bare, 'remote.txt', 'r\n', 'remote-c2');

  const r = await pullFastForwardOnly(dir, 'origin', 'main');
  assert.equal(r.ok, true, r.output);
  assert.equal(fs.existsSync(path.join(dir, 'remote.txt')), true, '远程提交应已拉取');
});

test('本地领先时 pull --ff-only 明确失败（铁律 1）', async () => {
  const { dir, bare, git } = await makeRepoWithRemote();

  // 双方分叉：远端推一个，本地也提交一个
  await advanceRemote(bare, 'remote.txt', 'r\n', 'remote-c2');
  await fs.promises.writeFile(path.join(dir, 'f.txt'), 'local-v2\n');
  await git(['add', '.']);
  await git(['commit', '--quiet', '-m', 'local-c2']);

  const r = await pullFastForwardOnly(dir, 'origin', 'main');
  assert.equal(r.ok, false, '分叉时必须失败，不能悄悄 merge');
});

test('脏工作区自动 stash 后更新成功，改动原样恢复（铁律 2 已升级）', async () => {
  const { dir, bare, git } = await makeRepoWithRemote();

  // 远端推进一个提交
  await advanceRemote(bare, 'remote.txt', 'r\n', 'remote-c2');

  // 本地制造未提交改动（跟踪文件改动 + 未跟踪文件各一个）
  await fs.promises.writeFile(path.join(dir, 'f.txt'), 'local-edit\n');
  await fs.promises.writeFile(path.join(dir, 'local-only.txt'), 'keep me\n');

  const r = await updateProject({
    id: 't', path: dir,
    update: { strategy: 'git', remote: 'origin', branch: 'main' },
  });

  assert.equal(r.ok, true, `应更新成功：${r.message}`);
  assert.equal(r.stashed, true, '应标记为自动暂存过');
  assert.equal(r.stashRestored, true, '应恢复暂存的改动');

  // 远程提交已拉取
  assert.equal(fs.existsSync(path.join(dir, 'remote.txt')), true, '远程新文件应存在');
  // 本地改动完整恢复（Windows 下 git 可能把 \n 转成 \r\n，归一化后比较）
  assert.equal(norm(fs.readFileSync(path.join(dir, 'f.txt'), 'utf8')), 'local-edit\n', '本地改动应恢复');
  assert.equal(fs.existsSync(path.join(dir, 'local-only.txt')), true, '未跟踪文件应恢复');
  // stash 已清空（没留下残留）
  const stashList = await exec('git', ['stash', 'list'], { cwd: dir, timeoutMs: 15000 });
  assert.equal(stashList.stdout.trim(), '', 'stash 应已清空');
});

test('更新失败时 stash 自动回滚，工作区回到原状', async () => {
  const { dir, bare, git } = await makeRepoWithRemote();

  // 双方分叉 → ff-only 必然失败
  await advanceRemote(bare, 'remote.txt', 'r\n', 'remote-c2');
  await fs.promises.writeFile(path.join(dir, 'f.txt'), 'local-edit\n');
  await git(['add', '.']);
  await git(['commit', '--quiet', '-m', 'local-c2']);

  const r = await updateProject({
    id: 't', path: dir,
    update: { strategy: 'git', remote: 'origin', branch: 'main' },
  });

  assert.equal(r.ok, false, '分叉时必须失败');
  // 关键：工作区必须回到更新前，stash 不能残留
  assert.equal(norm(fs.readFileSync(path.join(dir, 'f.txt'), 'utf8')), 'local-edit\n', '本地改动必须原样保留');
  const stashList = await exec('git', ['stash', 'list'], { cwd: dir, timeoutMs: 15000 });
  assert.equal(stashList.stdout.trim(), '', 'stash 必须已回滚，不能残留');
});

test('remote 检查失败时不会留下 stash（数据安全）', async () => {
  const { dir } = await makeRepoWithRemote();
  // 配一个不存在的 remote，让检查在 stash 之前就失败
  await fs.promises.writeFile(path.join(dir, 'f.txt'), 'local-edit\n');

  const r = await updateProject({
    id: 't', path: dir,
    update: { strategy: 'git', remote: 'nosuch', branch: 'main' },
  });

  assert.equal(r.ok, false);
  assert.match(r.message, /nosuch/);
  // 改动必须原地还在，且没有 stash 残留
  assert.equal(fs.readFileSync(path.join(dir, 'f.txt'), 'utf8'), 'local-edit\n');
  const stashList = await exec('git', ['stash', 'list'], { cwd: dir, timeoutMs: 15000 });
  assert.equal(stashList.stdout.trim(), '', '检查失败绝不能留下 stash');
});

test('updateProject 拒绝非 git 仓库', async () => {
  const plain = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-plain-'));
  const r = await updateProject({
    id: 't', path: plain,
    update: { strategy: 'git', remote: 'origin', branch: 'main' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /不是 git 仓库|未纳入/);
});

test('updateProject 对 strategy=none 直接说明不可更新', async () => {
  const dir = await makeRepo();
  const r = await updateProject({ id: 't', path: dir, update: { strategy: 'none' } });
  assert.equal(r.ok, false);
  assert.match(r.message, /手动更新|未纳入/);
});

test('updateProject 拒绝分支不匹配', async () => {
  const dir = await makeRepo();
  const r = await updateProject({
    id: 't', path: dir,
    update: { strategy: 'git', remote: 'origin', branch: 'develop' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /develop|分支/);
});

test('updateProject 拒绝缺失的 remote', async () => {
  const dir = await makeRepo();
  const r = await updateProject({
    id: 't', path: dir,
    update: { strategy: 'git', remote: 'nosuch', branch: 'main' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /nosuch|remote/);
});

test('fork 同步：缺少 upstream remote 时给出配置指引', async () => {
  const { dir } = await makeRepoWithRemote();

  const r = await updateProject({
    id: 't', path: dir,
    update: { strategy: 'git-fork', remote: 'origin', upstream: 'upstream', branch: 'main' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /upstream/);
});

test('fork 同步真实合并：上游新提交被合入', async () => {
  const { dir, bare, git } = await makeRepoWithRemote();

  // 把同一个 bare 既当 origin 又当 upstream 源：往上游推一个提交，验证能合入
  await advanceRemote(bare, 'up.txt', 'from upstream\n', 'upstream-c2');
  await git(['remote', 'add', 'upstream', bare]);

  const r = await updateProject({
    id: 't', path: dir,
    update: { strategy: 'git-fork', remote: 'origin', upstream: 'upstream', branch: 'main' },
  });
  assert.equal(r.ok, true, r.message);
  assert.equal(fs.existsSync(path.join(dir, 'up.txt')), true, '上游提交应已合入');
});

test('mergeUpstream 冲突时自动 abort 且不留下半合并状态（铁律 3）', async () => {
  const { dir, bare, git } = await makeRepoWithRemote();

  // 上游改 f.txt 的同一行
  await advanceRemote(bare, 'f.txt', 'upstream-change\n', 'upstream-edit');
  await git(['remote', 'add', 'upstream', bare]);

  // 本地也改同一行 → 必然冲突
  await fs.promises.writeFile(path.join(dir, 'f.txt'), 'local-change\n');
  await git(['add', '.']);
  await git(['commit', '--quiet', '-m', 'local-edit']);

  const r = await mergeUpstream(dir, 'upstream', 'main');
  assert.equal(r.ok, false, '冲突必须失败');

  // 关键：不能留下 MERGE_HEAD，工作区必须还能正常操作
  assert.equal(fs.existsSync(path.join(dir, '.git', 'MERGE_HEAD')), false, '不应残留 MERGE_HEAD');
  assert.equal(await currentBranch(dir), 'main', '分支应保持不变');
});

/* ============================================================
   git-clone：zip 解压得到的非仓库目录一键更新（需求 2）
   ============================================================ */

test('git-clone：非仓库目录首次更新即对齐上游，本地未跟踪文件保留', async () => {
  const bare = await makeBare();
  await advanceRemote(bare, 'app.js', 'v2\n', 'upstream-c2');   // 上游已有一次提交

  // 模拟 zip 解压：有旧版文件 + 本地配置/凭据，没有 .git
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-zip-'));
  await fs.promises.writeFile(path.join(dir, 'app.js'), 'v1\n');
  await fs.promises.writeFile(path.join(dir, 'config.json'), 'my local config\n');
  await fs.promises.mkdir(path.join(dir, 'data'), { recursive: true });
  await fs.promises.writeFile(path.join(dir, 'data', 'creds.txt'), 'secret\n');

  const r = await updateProject({
    id: 'zip', path: dir,
    update: { strategy: 'git-clone', remote: 'origin', branch: 'main', repoUrl: bare },
  });

  assert.equal(r.ok, true, `首次更新应成功：${r.message}`);
  assert.match(r.message, /汇合/);
  // 上游内容到位
  assert.equal(norm(fs.readFileSync(path.join(dir, 'app.js'), 'utf8')), 'v2\n', '应更新到上游版本');
  // 本地未跟踪文件原样保留
  assert.equal(norm(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')), 'my local config\n');
  assert.equal(fs.existsSync(path.join(dir, 'data', 'creds.txt')), true, '本地凭据必须保留');

  // 之后就是普通 git 仓库，走 ff-only
  const r2 = await updateProject({
    id: 'zip', path: dir,
    update: { strategy: 'git', remote: 'origin', branch: 'main' },
  });
  assert.equal(r2.ok, true, `二次更新应成功：${r2.message}`);
  assert.match(r2.message, /已是最新|已更新/);
});

test('git-clone：缺少 repoUrl 时明确报错', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-zip-'));
  const r = await updateProject({
    id: 'zip', path: dir,
    update: { strategy: 'git-clone', remote: 'origin', branch: 'main' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /repoUrl/);
});

test('git-clone：第二次调用（已是仓库）也能正常工作', async () => {
  const bare = await makeBare();
  await advanceRemote(bare, 'app.js', 'v2\n', 'c2');

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gpi-zip-'));
  await fs.promises.writeFile(path.join(dir, 'app.js'), 'v2\n');

  // 连续两次 git-clone：第一次建库汇合，第二次已是仓库
  const r1 = await updateProject({
    id: 'zip', path: dir,
    update: { strategy: 'git-clone', remote: 'origin', branch: 'main', repoUrl: bare },
  });
  assert.equal(r1.ok, true, r1.message);

  const r2 = await updateProject({
    id: 'zip', path: dir,
    update: { strategy: 'git-clone', remote: 'origin', branch: 'main', repoUrl: bare },
  });
  assert.equal(r2.ok, true, r2.message);
});
