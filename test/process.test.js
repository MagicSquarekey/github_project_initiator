/**
 * 共同启停集成测试。
 *
 * 用真实的 node 监听进程验证 start.companions 的完整生命周期：
 * 启动时一并拉起、主服务已运行时只补齐缺失项、required 失败要报错、
 * 停止/重启覆盖伴随服务端口。
 *
 * 不 mock 端口与进程：这套能力最容易出错的地方就是"端口真的开了没有"，
 * mock 掉就失去了测试意义。
 */

import test from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { startProject, stopProject, restartProject } from '../src/core/process.js';
import { isPortOpen } from '../src/core/probe.js';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function distinctPorts(count) {
  const ports = [];
  while (ports.length < count) {
    const p = await freePort();
    if (!ports.includes(p)) ports.push(p);
  }
  return ports;
}

/**
 * 一个最小的 HTTP 监听脚本；可选地要求环境变量，用来证明 env 被透传。
 *
 * @param {number} port
 * @param {{ requireEnv?: string }} [options]
 */
function listenScript(port, options = {}) {
  const envCheck = options.requireEnv
    ? `if (process.env[${JSON.stringify(options.requireEnv)}] !== 'yes') {
         console.error('missing env');
         process.exit(1);
       }`
    : '';
  return `
    ${envCheck}
    const http = require('http');
    const server = http.createServer((req, res) => res.end('ok'));
    server.listen(${port}, '127.0.0.1', () => console.log('READY ${port}'));
    setInterval(() => {}, 1000);
  `;
}

async function waitFor(fn, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function makeProject(id, mainPort, botPort, overrides = {}) {
  return {
    id,
    name: id,
    path: process.cwd(),
    kind: 'node-service',
    start: {
      command: process.execPath,
      args: ['-e', listenScript(mainPort)],
      detached: true,
      companions: [
        {
          name: 'bot',
          command: process.execPath,
          args: ['-e', listenScript(botPort, { requireEnv: 'GPI_COMPANION_OK' })],
          env: { GPI_COMPANION_OK: 'yes' },
          port: botPort,
          timeoutMs: 10000,
          required: true,
        },
      ],
    },
    stop: { strategy: 'port', ports: [mainPort, botPort] },
    url: null,
    port: mainPort,
    startupTimeoutMs: 10000,
    startupMatch: 'READY',
    update: { strategy: 'none' },
    ...overrides,
  };
}

test('启动同时拉起伴随服务，停止同时回收', async () => {
  const [mainPort, botPort] = await distinctPorts(2);
  const project = makeProject('companion-start-stop', mainPort, botPort);

  try {
    const started = await startProject(project);
    assert.equal(started.ok, true, started.message);
    assert.match(started.message, /伴随服务/);
    assert.equal(await isPortOpen(mainPort), true, '主服务端口应就绪');
    assert.equal(await isPortOpen(botPort), true, '伴随服务端口应就绪');

    const stopped = await stopProject(project);
    assert.equal(stopped.ok, true, stopped.message);
    assert.equal(await waitFor(async () => !(await isPortOpen(mainPort))), true, '主服务端口应释放');
    assert.equal(await waitFor(async () => !(await isPortOpen(botPort))), true, '伴随服务端口应释放');
  } finally {
    await stopProject(project);
  }
});

test('主服务已在运行时启动只补齐缺失的伴随服务', async () => {
  const [mainPort, botPort] = await distinctPorts(2);
  const project = makeProject('companion-ensure', mainPort, botPort);

  // 模拟"服务是别处启动的、bot 掉了"：只拉起主服务
  const main = spawn(process.execPath, ['-e', listenScript(mainPort)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    assert.equal(await waitFor(() => isPortOpen(mainPort)), true, '主服务应已监听');
    assert.equal(await isPortOpen(botPort), false);

    const r = await startProject(project);
    assert.equal(r.ok, true, r.message);
    assert.match(r.message, /已在运行/);
    assert.match(r.message, /已启动 bot/);
    assert.equal(await isPortOpen(botPort), true, '缺失的伴随服务应被补齐');
  } finally {
    await stopProject(project);
    try {
      process.kill(main.pid);
    } catch {
      // 已经随 stopProject 一起退出
    }
  }
});

test('required 伴随服务起不来时启动返回失败', async () => {
  const [mainPort, botPort] = await distinctPorts(2);
  const project = makeProject('companion-fail', mainPort, botPort, {
    start: {
      command: process.execPath,
      args: ['-e', listenScript(mainPort)],
      detached: true,
      companions: [
        {
          name: 'bot',
          command: process.execPath,
          args: ['-e', 'process.exit(3)'],
          port: botPort,
          timeoutMs: 3000,
          required: true,
        },
      ],
    },
  });

  try {
    const r = await startProject(project);
    assert.equal(r.ok, false);
    assert.match(r.message, /伴随服务 bot 未就绪/);
    assert.match(r.message, /code=3/);
    // 主服务本身仍然在跑——失败只针对伴随服务
    assert.equal(await isPortOpen(mainPort), true);
  } finally {
    await stopProject(project);
  }
});

test('重启会先回收伴随服务端口再一起拉起', async () => {
  const [mainPort, botPort] = await distinctPorts(2);
  const project = makeProject('companion-restart', mainPort, botPort);

  try {
    const first = await startProject(project);
    assert.equal(first.ok, true, first.message);

    const restarted = await restartProject(project);
    assert.equal(restarted.ok, true, restarted.message);
    assert.equal(await isPortOpen(mainPort), true);
    assert.equal(await isPortOpen(botPort), true);
  } finally {
    await stopProject(project);
  }
});
