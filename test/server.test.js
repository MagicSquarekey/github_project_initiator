/**
 * HTTP 路由测试。
 *
 * 不启动 src/index.js（那会占用 8780 并触发后台任务），
 * 直接 createServer() 监听临时端口，用临时 registry 文件验证：
 * 添加/移除/识别/浏览/CORS 的真实 HTTP 行为。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer } from '../src/server.js';

function tmpDir(prefix = 'gpi-server-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * 用 http.request 发请求，便于精确控制 Origin 等头。
 *
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string,string>, body?: string }} [options]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, text: string, json: any }>}
 */
function request(url, options = {}) {
  const { method = 'GET', headers = {}, body } = options;
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('添加 / 识别 / 浏览 / 移除 的完整 HTTP 流程', async () => {
  const registryFile = path.join(tmpDir('gpi-server-registry-'), 'registry.json');
  fs.writeFileSync(registryFile, JSON.stringify({ version: 1, projects: [] }), 'utf8');

  const projectDir = tmpDir('gpi-server-project-');
  fs.mkdirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'demo', scripts: { start: 'node app.js' } }));
  fs.writeFileSync(path.join(projectDir, '.env'), 'PORT=45678\n');

  const previous = process.env.GPI_REGISTRY_FILE;
  process.env.GPI_REGISTRY_FILE = registryFile;

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. 添加项目
    const add = await request(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Demo App',
        path: projectDir,
        kind: 'node-service',
        startCommand: 'cmd.exe',
        startArgs: '/c npm start',
        port: '45678',
        stopStrategy: 'port',
        updateStrategy: 'none',
      }),
    });
    assert.equal(add.status, 201, add.text);
    assert.equal(add.json.ok, true);
    assert.equal(add.json.project.id, 'demo-app');

    const saved = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(saved.projects.length, 1);
    assert.equal(saved.projects[0].id, 'demo-app');

    // 2. 重复添加同一目录 → 400 且带可读错误
    const dup = await request(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Another',
        path: projectDir,
        kind: 'node-service',
        startCommand: 'cmd.exe',
        startArgs: '/c npm start',
        port: '45679',
      }),
    });
    assert.equal(dup.status, 400);
    assert.equal(dup.json.ok, false);
    assert.ok(dup.json.errors.join().includes('已由项目'));

    // 3. 非法 JSON → 400
    const bad = await request(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(bad.status, 400);

    // 4. 识别目录
    const inspect = await request(`${base}/api/inspect?path=${encodeURIComponent(projectDir)}`);
    assert.equal(inspect.status, 200);
    assert.equal(inspect.json.exists, true);
    assert.equal(inspect.json.kind, 'node-service');
    assert.equal(inspect.json.port, 45678);

    // 5. 浏览目录
    const browse = await request(`${base}/api/browse?path=${encodeURIComponent(projectDir)}`);
    assert.equal(browse.status, 200);
    assert.deepEqual(browse.json.entries.map((e) => e.name), ['src']);

    // 6. 管理器自身不能被移除
    const self = await request(`${base}/api/projects/manager`, { method: 'DELETE' });
    assert.equal(self.status, 403);

    // 7. 移除项目
    const remove = await request(`${base}/api/projects/demo-app`, { method: 'DELETE' });
    assert.equal(remove.status, 200);
    assert.equal(remove.json.ok, true);
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).projects.length, 0);

    // 8. 再移除 → 404
    const again = await request(`${base}/api/projects/demo-app`, { method: 'DELETE' });
    assert.equal(again.status, 404);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.GPI_REGISTRY_FILE;
    else process.env.GPI_REGISTRY_FILE = previous;
  }
});

test('CORS：只放行本机来源，公网 Origin 不返回允许头', async () => {
  const registryFile = path.join(tmpDir('gpi-server-cors-'), 'registry.json');
  fs.writeFileSync(registryFile, JSON.stringify({ version: 1, projects: [] }), 'utf8');

  const previous = process.env.GPI_REGISTRY_FILE;
  process.env.GPI_REGISTRY_FILE = registryFile;

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const evil = await request(`${base}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(evil.status, 204);
    assert.equal(evil.headers['access-control-allow-origin'], undefined);

    const local = await request(`${base}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(local.status, 204);
    assert.equal(local.headers['access-control-allow-origin'], 'http://localhost:5173');

    const fileOrigin = await request(`${base}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'null' },
    });
    assert.equal(fileOrigin.headers['access-control-allow-origin'], 'null');
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.GPI_REGISTRY_FILE;
    else process.env.GPI_REGISTRY_FILE = previous;
  }
});
