/**
 * GPI_HOST 解析测试。
 *
 * 部署脚本会把多个地址写进一个环境变量；解析错了服务直接起不来
 * （整串被当主机名 → EAI_NONAME），所以这里锁死拆分与收敛规则。
 */

import test from 'node:test';
import assert from 'node:assert';
import { parseListenHosts } from '../src/core/listen.js';

test('默认只监听回环', () => {
  assert.deepEqual(parseListenHosts(undefined), ['127.0.0.1']);
  assert.deepEqual(parseListenHosts(null), ['127.0.0.1']);
  assert.deepEqual(parseListenHosts(''), ['127.0.0.1']);
  assert.deepEqual(parseListenHosts('  ,  '), ['127.0.0.1']);
});

test('逗号分隔的多地址会拆开并去重', () => {
  assert.deepEqual(
    parseListenHosts('127.0.0.1,100.65.61.59,192.168.31.96'),
    ['127.0.0.1', '100.65.61.59', '192.168.31.96'],
  );
  assert.deepEqual(parseListenHosts(' 127.0.0.1 , 127.0.0.1 '), ['127.0.0.1']);
  assert.deepEqual(parseListenHosts('::1'), ['::1']);
});

test('0.0.0.0 / :: 覆盖全部网卡，收敛为单监听（否则 EADDRINUSE）', () => {
  assert.deepEqual(parseListenHosts('0.0.0.0,100.65.61.59'), ['0.0.0.0']);
  assert.deepEqual(parseListenHosts('::'), ['::']);
  assert.deepEqual(parseListenHosts('100.65.61.59,0.0.0.0'), ['0.0.0.0']);
});
