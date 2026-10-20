/**
 * 版本探测测试。
 *
 * 每种来源各测一条，外加"静态覆盖优先"和"完全无来源返回 null"。
 * 临时目录用 mkdtemp，测试结束即删，不碰本机任何项目。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { detectVersion, clearVersionCache } from '../src/core/version.js';

/**
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpi-ver-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * @param {string} dir
 * @param {any} [over]
 * @returns {Promise<string|null>}
 */
function detect(dir, over = {}) {
  clearVersionCache();
  return detectVersion({ id: `t-${path.basename(dir)}`, path: dir, ...over });
}

test('package.json 的 version', async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '2.19.5' }));
  assert.equal(await detect(dir), '2.19.5');
});

test('pyproject.toml 只读 [project] 段的 version', async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(
    path.join(dir, 'pyproject.toml'),
    '[project]\nname = "x"\nversion = "1.2.3"\n\n[tool.other]\nversion = "9.9.9"\n',
  );
  assert.equal(await detect(dir), '1.2.3');
});

test('VERSION 文件首行', async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'VERSION'), '3.4.5\n');
  assert.equal(await detect(dir), '3.4.5');
});

test('静态 version 覆盖清单文件', async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  assert.equal(await detect(dir, { version: '7.8.9' }), '7.8.9');
});

test('根目录 Python 的 VERSION 常量（qoder 形式）', async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'proxy.py'), 'VERSION = "1.5.10"\n');
  assert.equal(await detect(dir), '1.5.10');
});

test('monorepo 子目录 frontend/package.json（AutoTestHub 形式）', async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, 'frontend'));
  fs.writeFileSync(path.join(dir, 'frontend', 'package.json'), JSON.stringify({ version: '1.0.0' }));
  assert.equal(await detect(dir), '1.0.0');
});

test('Elasticsearch 从 lib/elasticsearch-<version>.jar 取版本', async (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'elasticsearch-8.17.4.jar'), '');
  // 干扰项：不能误匹配 elasticsearch-cli
  fs.writeFileSync(path.join(dir, 'lib', 'elasticsearch-cli-9.9.9.jar'), '');
  assert.equal(await detect(dir), '8.17.4');
});

test('versionCommand 动态查询（OpenViking 形式）', async (t) => {
  const dir = tmpDir(t);
  assert.equal(
    await detect(dir, {
      versionCommand: {
        command: process.execPath,
        args: ['-e', 'console.log("0.5.0")'],
        timeoutMs: 10000,
      },
    }),
    '0.5.0',
  );
});

test('无清单时用 git describe（2048/Grimoire 形式）', async (t) => {
  const dir = tmpDir(t);
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['tag', 'v1.2.3'], { cwd: dir });
  assert.equal(await detect(dir), 'v1.2.3');
});

test('完全没有版本来源时返回 null', async (t) => {
  const dir = tmpDir(t);
  assert.equal(await detect(dir), null);
});
