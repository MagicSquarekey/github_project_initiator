#!/usr/bin/env node
/**
 * 跨平台测试入口。
 *
 * 为什么不用 `node --test test/` 或 `node --test test/*.test.js`：
 * 前者在某些 Node 版本会把目录当模块解析而报错，后者依赖 shell 展开通配符
 * ——Windows 的 cmd.exe 不展开。这里自己枚举文件再传给 node，行为一致。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(root, 'test');

const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => path.join(testDir, f));

if (files.length === 0) {
  console.error('没有找到测试文件');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
