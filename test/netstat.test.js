/**
 * netstat 端口解析测试。
 *
 * 这是整套启停能力的基石，也是边界情况最集中的地方，
 * 所以用真实 netstat 输出格式做样本逐条断言。
 */

import test from 'node:test';
import assert from 'node:assert';
import { parsePidsOnPort } from '../src/core/netstat.js';

/** 真实 netstat -ano 输出样本（CRLF 行尾，Windows 实际格式） */
const SAMPLE = [
  '活动连接',
  '',
  '  协议  本地地址          外部地址        状态           PID',
  '  TCP    0.0.0.0:8090           0.0.0.0:0              LISTENING       51392',
  '  TCP    [::]:8090               [::]:0                 LISTENING       51392',
  '  TCP    127.0.0.1:8790         0.0.0.0:0              LISTENING       42704',
  '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       39840',
  '  TCP    [::]:3000               [::]:0                 LISTENING       39840',
  '  TCP    127.0.0.1:5173          0.0.0.0:0              LISTENING       48828',
  '  TCP    0.0.0.0:7863           0.0.0.0:0              LISTENING       14676',
  '  TCP    127.0.0.1:54321         127.0.0.1:54322        ESTABLISHED     12345',
].join('\r\n');

test('解析出正确 PID', () => {
  assert.deepEqual(parsePidsOnPort(SAMPLE, 8090), [51392]);
  assert.deepEqual(parsePidsOnPort(SAMPLE, 3000), [39840]);
  assert.deepEqual(parsePidsOnPort(SAMPLE, 8790), [42704]);
});

test('IPv4 与 IPv6 双 LISTENING 去重为一个 PID', () => {
  // 8090 同时有 0.0.0.0 和 [::] 两条，PID 相同，只能出现一次
  const pids = parsePidsOnPort(SAMPLE, 8090);
  assert.equal(pids.length, 1);
});

test('不误匹配端口前缀不同的行', () => {
  // :8090 不能命中 :80901 或 :18090 —— 这是最危险的边界
  const tricky = [
    '  TCP    0.0.0.0:80901          0.0.0.0:0              LISTENING       99999',
    '  TCP    0.0.0.0:18090          0.0.0.0:0              LISTENING       88888',
    '  TCP    0.0.0.0:8090           0.0.0.0:0              LISTENING       77777',
  ].join('\r\n');
  assert.deepEqual(parsePidsOnPort(tricky, 8090), [77777]);
});

test('只取 LISTENING 状态，忽略 ESTABLISHED 等', () => {
  // 54321 是 ESTABLISHED，不是监听，不应计入
  assert.deepEqual(parsePidsOnPort(SAMPLE, 54321), []);
});

test('未监听的端口返回空数组', () => {
  assert.deepEqual(parsePidsOnPort(SAMPLE, 65001), []);
});

test('空输入不抛错', () => {
  assert.deepEqual(parsePidsOnPort('', 8090), []);
  assert.deepEqual(parsePidsOnPort(null, 8090), []);
  assert.deepEqual(parsePidsOnPort(undefined, 8090), []);
});

test('LF 行尾同样能解析', () => {
  const lf = SAMPLE.replace(/\r\n/g, '\n');
  assert.deepEqual(parsePidsOnPort(lf, 8090), [51392]);
});

test('多个不同 PID 同端口时全部返回且有序', () => {
  // 端口被多个进程监听（如 SO_REUSEPORT）时都应列出
  const multi = [
    '  TCP    0.0.0.0:9000           0.0.0.0:0              LISTENING       333',
    '  TCP    [::]:9000               [::]:0                 LISTENING       111',
    '  TCP    127.0.0.1:9000         0.0.0.0:0              LISTENING       222',
  ].join('\r\n');
  assert.deepEqual(parsePidsOnPort(multi, 9000), [111, 222, 333]);
});

test('PID 为 0 的行被忽略', () => {
  const zero = '  TCP    0.0.0.0:9100           0.0.0.0:0              LISTENING       0';
  assert.deepEqual(parsePidsOnPort(zero, 9100), []);
});

test('非 netstat 文本不误判', () => {
  assert.deepEqual(parsePidsOnPort('hello world\nfoo bar', 8090), []);
});
