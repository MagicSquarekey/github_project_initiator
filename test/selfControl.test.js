/**
 * 自管理（重启/更新）相关测试。
 *
 * 重点锁住：平台判定、端口探测、健康轮询，以及"新代码能起来"的自检本身。
 * 真正重启进程的行为不在这里做（会把测试进程自己退掉），走手工 E2E。
 */

import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import net from 'node:net';
import {
  isUnderSystemd,
  pickFreePort,
  waitForHealth,
  preflightNewCode,
  selfPort,
} from '../src/core/selfControl.js';

test('systemd 判定只看 INVOCATION_ID', () => {
  const prev = process.env.INVOCATION_ID;
  try {
    delete process.env.INVOCATION_ID;
    assert.equal(isUnderSystemd(), false);
    process.env.INVOCATION_ID = 'test-invocation';
    assert.equal(isUnderSystemd(), true);
  } finally {
    if (prev === undefined) delete process.env.INVOCATION_ID;
    else process.env.INVOCATION_ID = prev;
  }
});

test('selfPort 默认 8780，GPI_PORT 可覆盖', () => {
  const prev = process.env.GPI_PORT;
  try {
    delete process.env.GPI_PORT;
    assert.equal(selfPort(), 8780);
    process.env.GPI_PORT = '8901';
    assert.equal(selfPort(), 8901);
  } finally {
    if (prev === undefined) delete process.env.GPI_PORT;
    else process.env.GPI_PORT = prev;
  }
});

test('pickFreePort 返回可以再次绑定的端口', async () => {
  const port = await pickFreePort();
  assert.ok(Number.isInteger(port) && port > 0);
  await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => srv.close(resolve));
  });
});

test('waitForHealth：没人监听时返回 null', async () => {
  const port = await pickFreePort(); // 拿到后立刻释放，此时没人监听
  const started = Date.now();
  const r = await waitForHealth(port, 600);
  assert.equal(r, null);
  assert.ok(Date.now() - started < 5000, '不应该拖太久');
});

test('waitForHealth：健康接口返回 ok 时能识别', async () => {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptimeSec: 1 }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  try {
    const h = await waitForHealth(port, 3000);
    assert.equal(h?.ok, true);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('自检：当前代码能在随机端口起来（真正的 canary）', { timeout: 90000 }, async () => {
  const res = await preflightNewCode({ timeoutMs: 30000 });
  assert.equal(res.ok, true, res.detail);
});
