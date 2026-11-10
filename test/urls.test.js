/**
 * 地址展示测试。
 *
 * 看板把「配置地址 + 各网卡地址」排在一起；配置里写了末尾斜杠时会出现
 * "100.65.61.59/" 与 "10.8.0.18" 混排，看起来像两个不同的地址。
 * 这里锁定归一化规则：只去掉根路径的斜杠，真实路径不动。
 */

import test from 'node:test';
import assert from 'node:assert';
import { withoutRootSlash } from '../src/api/projects.js';

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
