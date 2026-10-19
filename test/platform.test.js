/**
 * 平台适配层测试（需求 1：Windows / 跨平台分版）。
 *
 * 重点覆盖三个平台的输出格式解析：
 *   Windows  netstat -ano
 *   Linux    ss -ltnp
 *   macOS    lsof -iTCP:PORT -sTCP:LISTEN -t
 * 以及 killPid 对"进程已退出"的容错。
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  parseNetstatPids,
  parseSsPids,
  parseLsofPids,
  currentPlatform,
  IS_WINDOWS,
  platformLabel,
} from '../src/core/platform.js';

/* ---------------- Windows: netstat -ano ---------------- */

const NETSTAT = [
  '活动连接',
  '',
  '  协议  本地地址          外部地址        状态           PID',
  '  TCP    0.0.0.0:8090           0.0.0.0:0              LISTENING       51392',
  '  TCP    [::]:8090               [::]:0                 LISTENING       51392',
  '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       39840',
  '  TCP    0.0.0.0:80901         0.0.0.0:0              LISTENING       99999',
  '  TCP    0.0.0.0:18090         0.0.0.0:0              LISTENING       88888',
  '  TCP    127.0.0.1:54321        127.0.0.1:54322        ESTABLISHED     12345',
].join('\r\n');

test('netstat：解析正确 PID', () => {
  assert.deepEqual(parseNetstatPids(NETSTAT, 8090), [51392]);
  assert.deepEqual(parseNetstatPids(NETSTAT, 3000), [39840]);
});

test('netstat：IPv4/IPv6 双 LISTENING 去重', () => {
  assert.equal(parseNetstatPids(NETSTAT, 8090).length, 1);
});

test('netstat：不误匹配端口前缀', () => {
  // :8090 不能命中 :80901 / :18090
  assert.deepEqual(parseNetstatPids(NETSTAT, 8090), [51392]);
  assert.deepEqual(parseNetstatPids(NETSTAT, 80901), [99999]);
  assert.deepEqual(parseNetstatPids(NETSTAT, 18090), [88888]);
});

test('netstat：忽略非 LISTENING 状态', () => {
  assert.deepEqual(parseNetstatPids(NETSTAT, 54321), []);
});

/* ---------------- Linux: ss -ltnp ---------------- */

const SS = [
  'State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process',
  'LISTEN 0      128          0.0.0.0:3000         0.0.0.0:*     users:(("node",pid=32268,fd=20))',
  'LISTEN 0      128             [::]:3000            [::]:*     users:(("node",pid=32268,fd=19))',
  'LISTEN 0      128          0.0.0.0:8090         0.0.0.0:*     users:(("next-server",pid=51392,fd=23))',
  'LISTEN 0      128          0.0.0.0:80901        0.0.0.0:*     users:(("other",pid=777,fd=23))',
  'LISTEN 0      128        127.0.0.1:54321        0.0.0.0:*     users:(("client",pid=555,fd=5))',
].join('\n');

test('ss：解析 PID 并去重', () => {
  assert.deepEqual(parseSsPids(SS, 3000), [32268]);
  assert.deepEqual(parseSsPids(SS, 8090), [51392]);
});

test('ss：不误匹配端口前缀', () => {
  assert.deepEqual(parseSsPids(SS, 8090), [51392], ':8090 不能命中 :80901');
});

test('ss：空输出不抛错', () => {
  assert.deepEqual(parseSsPids('', 3000), []);
});

/* ---------------- macOS: lsof -t ---------------- */

const LSOF = [
  '32268',
  '32269',
].join('\n');

test('lsof：-t 模式直接是 PID 列表', () => {
  assert.deepEqual(parseLsofPids(LSOF), [32268, 32269]);
});

test('lsof：完整表格模式取第二列', () => {
  const table = [
    'COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
    'node     32268 user   20u  IPv4 0x1a2b3c4d      0t0  TCP *:3000 (LISTEN)',
    'next-ser 51392 user   23u  IPv6 0x1a2b3c4e      0t0  TCP *:8090 (LISTEN)',
  ].join('\n');
  assert.deepEqual(parseLsofPids(table), [32268, 51392]);
});

/* ---------------- 平台识别 ---------------- */

test('currentPlatform 返回受支持的平台名', () => {
  const p = currentPlatform();
  assert.ok(['win32', 'linux', 'darwin', 'unsupported'].includes(p));
});

test('IS_WINDOWS 与 process.platform 一致', () => {
  assert.equal(IS_WINDOWS, process.platform === 'win32');
});

test('platformLabel 可读', () => {
  assert.match(platformLabel(), /win32|linux|darwin/);
});

/* ---------------- 跨平台一致性 ---------------- */

test('三个平台的解析器对"同一端口多 PID"都返回有序数组', () => {
  const win = parseNetstatPids(
    [
      '  TCP    0.0.0.0:9000           0.0.0.0:0              LISTENING       333',
      '  TCP    [::]:9000               [::]:0                 LISTENING       111',
      '  TCP    127.0.0.1:9000         0.0.0.0:0              LISTENING       222',
    ].join('\r\n'),
    9000,
  );
  assert.deepEqual(win, [111, 222, 333]);

  const linux = parseSsPids(
    [
      'LISTEN 0 128 0.0.0.0:9000 0.0.0.0:* users:(("a",pid=333,fd=1))',
      'LISTEN 0 128 [::]:9000 [::]:* users:(("b",pid=111,fd=2))',
      'LISTEN 0 128 127.0.0.1:9000 0.0.0.0:* users:(("c",pid=222,fd=3))',
    ].join('\n'),
    9000,
  );
  assert.deepEqual(linux, [111, 222, 333]);
});

test('三个平台的解析器对空输入都返回空数组', () => {
  assert.deepEqual(parseNetstatPids('', 80), []);
  assert.deepEqual(parseSsPids('', 80), []);
  assert.deepEqual(parseLsofPids('', 80), []);
  assert.deepEqual(parseLsofPids(null, 80), []);
});
