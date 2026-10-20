/**
 * 启动脚本存在性预检。
 *
 * 这里锁的是一个容易误伤的边界：`cmd.exe /c npm start` 里的 `npm` 是 PATH 命令，
 * 不是项目目录里的文件。若把它当脚本检查，项目会被错误标记为"不可启动"，
 * 看板连启动按钮都不显示。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describeProject } from '../src/api/projects.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gpi-startable-'));
}

function project(dir, start) {
  return {
    id: 'demo',
    name: 'Demo',
    path: dir,
    kind: 'node-service',
    start,
    stop: { strategy: 'none' },
    url: null,
    port: null,
    startupTimeoutMs: 0,
    update: { strategy: 'none' },
  };
}

test('PATH 命令（npm / node）不因项目内没有同名文件而被判不可启动', async () => {
  const dir = tmpDir();
  const viaCmd = await describeProject(project(dir, { command: 'cmd.exe', args: ['/c', 'npm', 'start'] }));
  assert.equal(viaCmd.startable, true);

  const direct = await describeProject(project(dir, { command: 'node', args: [] }));
  assert.equal(direct.startable, true);
});

test('明确指向不存在的脚本时判不可启动', async () => {
  const dir = tmpDir();
  const d = await describeProject(project(dir, { command: 'cmd.exe', args: ['/c', 'missing.bat'] }));
  assert.equal(d.startable, false);
});

test('存在的脚本 / 可执行文件判可启动', async () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'start.bat'), '@echo off');
  const script = await describeProject(project(dir, { command: 'cmd.exe', args: ['/c', 'start.bat'] }));
  assert.equal(script.startable, true);

  fs.writeFileSync(path.join(dir, 'app.exe'), '');
  const exe = await describeProject(project(dir, { command: 'app.exe', args: [] }));
  assert.equal(exe.startable, true);
});
