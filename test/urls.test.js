/**
 * 地址展示测试。
 *
 * 看板把「配置地址 + 各网卡地址」排在一起；配置里写了末尾斜杠时会出现
 * "100.65.61.59/" 与 "10.8.0.18" 混排，看起来像两个不同的地址。
 * 这里锁定归一化规则与多地址展开：本地访问也要列出所有网卡，
 * 只是保留 127.0.0.1 并放在最前；远程访问则丢掉回环地址。
 */

import test from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { withoutRootSlash, describeProject } from '../src/api/projects.js';
import { buildSelfProject } from '../src/core/registry.js';

/** 本机是否有真实网卡（CI/容器里可能只有回环） */
function hasLanAddress() {
  return Object.values(os.networkInterfaces()).some((list) => (list ?? []).some(
    (i) => (i.family === 'IPv4' || i.family === 4)
      && !i.internal
      && !i.address.startsWith('169.254.'),
  ));
}

function demoProject(over = {}) {
  return {
    id: 'demo-urls',
    name: 'Demo',
    path: path.join(os.tmpdir(), 'gpi-nonexistent-demo'),
    enabled: true,
    kind: 'node-service',
    start: { command: null, args: [] },
    stop: { strategy: 'none' },
    update: { strategy: 'none' },
    port: 3999,
    ports: [3999],
    url: 'http://127.0.0.1:3999',
    ...over,
  };
}

test('根路径末尾斜杠被去掉', () => {
  assert.equal(withoutRootSlash('http://100.65.61.59/'), 'http://100.65.61.59');
  assert.equal(withoutRootSlash('http://127.0.0.1:8780/'), 'http://127.0.0.1:8780');
  assert.equal(withoutRootSlash('https://host:443/'), 'https://host:443');
});

test('带真实路径的地址保持原样', () => {
  assert.equal(withoutRootSlash('http://127.0.0.1:7863/panel/'), 'http://127.0.0.1:7863/panel/');
  assert.equal(withoutRootSlash('http://127.0.0.1:5173'), 'http://127.0.0.1:5173');
});

test('查询串前的根斜杠也去掉', () => {
  assert.equal(withoutRootSlash('http://h/?x=1'), 'http://h?x=1');
});

test('非字符串原样返回', () => {
  assert.equal(withoutRootSlash(null), null);
  assert.equal(withoutRootSlash(undefined), undefined);
});

test('本地访问：管理器自身也列出所有网卡地址', async () => {
  const self = await describeProject(buildSelfProject(), { host: '127.0.0.1:8780', remote: false });
  assert.equal(self.urls[0], 'http://127.0.0.1:8780', '当前地址排最前');
  if (hasLanAddress()) {
    assert.ok(self.urls.length > 1, '本地访问也应该列出网卡地址');
  }
  for (const u of self.urls) assert.match(u, /^http:\/\/[^/]+:8780$/);
});

test('本地访问：项目地址展开到所有网卡，回环排最前', async () => {
  const { urls } = await describeProject(demoProject(), { host: '127.0.0.1:8780', remote: false });
  assert.equal(urls[0], 'http://127.0.0.1:3999');
  if (hasLanAddress()) {
    assert.ok(urls.length > 1, '本地访问也应该列出网卡地址');
  }
  for (const u of urls) assert.match(u, /^http:\/\/[^/]+:3999$/);
});

test('本地访问：带路径的地址展开后保留路径', async () => {
  const { urls } = await describeProject(
    demoProject({ url: 'http://127.0.0.1:3999/panel/?a=1' }),
    { host: '127.0.0.1:8780', remote: false },
  );
  assert.equal(urls[0], 'http://127.0.0.1:3999/panel/?a=1');
  if (urls.length > 1) {
    for (const u of urls.slice(1)) assert.match(u, /^http:\/\/[^/]+:3999\/panel\/\?a=1$/);
  }
});

test('远程访问：不列回环地址', async () => {
  const { urls } = await describeProject(demoProject(), { host: '192.168.1.5:8780', remote: true });
  assert.ok(urls.every((u) => !u.includes('127.0.0.1')), '远程访问不该出现 127.0.0.1');
  for (const u of urls) assert.match(u, /^http:\/\/[^/]+:3999$/);
});

