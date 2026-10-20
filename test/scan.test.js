/**
 * 目录识别与扫描测试。
 *
 * 锁住"添加项目"最容易出错的环节：识别出的启动方式/端口必须来自真实文件，
 * 且扫描不能把 node_modules、隐藏目录当成项目。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectDirectory } from '../src/api/inspect.js';
import { scanForProjects } from '../src/api/scan.js';
import { browseDirectories } from '../src/api/browse.js';

function tmpDir(prefix = 'gpi-scan-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

test('inspect：识别 package.json 脚本、启动脚本、.env 端口', () => {
  const dir = tmpDir();
  write(path.join(dir, 'package.json'), JSON.stringify({
    name: 'demo',
    scripts: { start: 'node server.js', dev: 'vite' },
  }));
  write(path.join(dir, 'start.bat'), '@echo off');
  write(path.join(dir, '.env'), 'PORT=4567\n');

  const info = inspectDirectory(dir, { registryProjects: [] });
  assert.equal(info.exists, true);
  assert.equal(info.kind, 'node-service');
  assert.equal(info.port, 4567);
  assert.equal(info.ports[0], 4567);
  assert.equal(info.update, 'none');
  assert.ok(info.startCandidates.length >= 2, '至少应有 start.bat 与 npm start 两种建议');
  assert.ok(info.startCandidates.some((c) => /start\.bat/.test(c.label)));
  assert.ok(info.startCandidates.some((c) => /npm/.test(c.label)));
});

test('inspect：识别项目专属启动脚本（start-libretv.cmd 这类）', () => {
  const dir = tmpDir();
  write(path.join(dir, 'start-libretv.cmd'), 'npm run dev');

  const info = inspectDirectory(dir, { registryProjects: [] });
  const script = info.startCandidates.find((c) => /start-libretv\.cmd/.test(c.label));
  assert.ok(script, '应识别出 start-libretv.cmd');
  assert.equal(script.args[script.args.length - 1], 'start-libretv.cmd');
});

test('inspect：启动脚本里的端口优先于 package.json 脚本', () => {
  const dir = tmpDir();
  write(path.join(dir, 'package.json'), JSON.stringify({ scripts: { start: 'next start -p 8080' } }));
  write(path.join(dir, 'start-libretv.cmd'), 'set PORT=8090\r\nnpm run dev\r\n');

  const info = inspectDirectory(dir, { registryProjects: [] });
  assert.equal(info.port, 8090);
});

test('inspect：config.json 的 listen 端口', () => {
  const dir = tmpDir();
  write(path.join(dir, 'config.json'), JSON.stringify({ listen: ':7863' }));
  write(path.join(dir, 'app.exe'), '');

  const info = inspectDirectory(dir, { registryProjects: [] });
  assert.equal(info.port, 7863);
  assert.equal(info.kind, 'desktop-app');
  assert.equal(info.start.command, 'app.exe');
});

test('inspect：git 仓库建议 git 更新，非 git 建议 none', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, '.git'));
  write(path.join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');

  const info = inspectDirectory(dir, { registryProjects: [] });
  assert.equal(info.git, true);
  assert.equal(info.update, 'git');
  assert.equal(info.kind, 'python-service');
});

test('inspect：不存在的目录返回 exists=false', () => {
  const info = inspectDirectory(path.join(os.tmpdir(), 'gpi-no-such-dir-xyz'));
  assert.equal(info.exists, false);
  assert.ok(info.error);
});

test('scan：发现项目、跳过 node_modules 与隐藏目录、标记已纳管', async () => {
  const root = tmpDir();
  write(path.join(root, 'app-a', 'package.json'), JSON.stringify({ name: 'a', scripts: { start: 'node a.js' } }));
  write(path.join(root, 'app-b', 'pyproject.toml'), '[project]\nname = "b"\n');
  write(path.join(root, 'plain', 'readme.txt'), 'not a project');
  write(path.join(root, 'node_modules', 'pkg', 'package.json'), '{}');
  write(path.join(root, '.hidden', 'package.json'), '{}');

  const result = await scanForProjects(root, 2, { registryProjects: [{ path: path.join(root, 'app-a') }] });
  assert.equal(result.root, path.resolve(root));

  const names = result.candidates.map((c) => c.name).sort();
  assert.deepEqual(names, ['app-a', 'app-b']);
  assert.equal(result.candidates.find((c) => c.name === 'app-a').managed, true);
  assert.equal(result.candidates.find((c) => c.name === 'app-b').managed, false);
});

test('scan：根目录不存在时返回错误而不是抛异常', async () => {
  const result = await scanForProjects(path.join(os.tmpdir(), 'gpi-scan-missing-xyz'));
  assert.equal(result.candidates.length, 0);
  assert.ok(result.error);
});

test('browse：只列目录、跳过隐藏与 node_modules，并给出父目录', () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'beta'));
  fs.mkdirSync(path.join(root, 'alpha'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  write(path.join(root, 'file.txt'), 'x');

  const data = browseDirectories(root);
  assert.equal(data.path, path.resolve(root));
  assert.deepEqual(data.entries.map((e) => e.name), ['alpha', 'beta']);
  assert.equal(data.parent, path.dirname(path.resolve(root)));
  assert.ok(Array.isArray(data.shortcuts));
});

test('browse：不传路径时返回盘符/根目录入口', () => {
  const data = browseDirectories();
  assert.equal(data.path, null);
  assert.ok(data.entries.length >= 1);
});

test('browse：传文件路径时给出错误', () => {
  const root = tmpDir();
  const file = path.join(root, 'a.txt');
  write(file, 'x');
  const data = browseDirectories(file);
  assert.ok(data.error);
  assert.equal(data.entries.length, 0);
});
