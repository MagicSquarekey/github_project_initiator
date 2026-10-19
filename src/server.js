/**
 * HTTP 服务：路由 + 静态看板。
 *
 * 用内置 node:http，不引 express——路由只有十来个，
 * 引框架要连带处理中间件、错误处理一整套，收益为负。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGER_PORT } from './core/registry.js';
import * as projectsApi from './api/projects.js';
import { scanForProjects } from './api/scan.js';
import { logger } from './util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server.js 位于 src/ 下，项目根是上一级（对比：src/core/*、src/util/* 需要两级）
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

/**
 * 创建 HTTP 服务。
 *
 * @returns {http.Server}
 */
export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${MANAGER_PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    // CORS：看板可能从 file:// 或其他端口打开
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    try {
      // —— API 路由 ——
      if (pathname.startsWith('/api/')) {
        await handleApi(req, res, pathname, url);
        return;
      }

      // —— 静态资源 ——
      if (req.method === 'GET') {
        serveStatic(res, pathname);
        return;
      }

      sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: '方法不允许' });
    } catch (err) {
      logger.error('请求处理异常', { pathname, error: err.message });
      sendJson(res, 500, { ok: false, error: 'INTERNAL', message: err.message });
    }
  });
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 * @param {URL} url
 */
async function handleApi(req, res, pathname, url) {
  const method = req.method ?? 'GET';

  // GET /api/health —— 管理器自身健康
  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, uptimeSec: Math.floor(process.uptime()) });
    return;
  }

  // GET /api/projects —— 全量状态（看板轮询用）
  if (method === 'GET' && pathname === '/api/projects') {
    sendJson(res, 200, await projectsApi.describeAll());
    return;
  }

  // POST /api/update-all —— 批量更新
  if (method === 'POST' && pathname === '/api/update-all') {
    sendJson(res, 200, await projectsApi.updateAll());
    return;
  }

  // POST /api/scan —— 目录扫描
  if (method === 'POST' && pathname === '/api/scan') {
    const body = await readBody(req);
    const root = body?.root;
    const result = await scanForProjects(root);
    sendJson(res, 200, result);
    return;
  }

  // /api/projects/:id/...
  const m = pathname.match(/^\/api\/projects\/([a-z0-9-]+)(?:\/([a-z-]+))?$/i);
  if (m) {
    const id = m[1];
    const action = m[2];

    if (method === 'GET' && !action) {
      sendJson(res, 200, await projectsApi.describeOne(id));
      return;
    }

    if (method === 'GET' && action === 'logs') {
      const lines = Number.parseInt(url.searchParams.get('lines') ?? '200', 10);
      sendJson(res, 200, projectsApi.logs(id, Number.isInteger(lines) ? lines : 200));
      return;
    }

    if (method === 'POST' && action === 'start') {
      sendJson(res, 200, await projectsApi.start(id));
      return;
    }
    if (method === 'POST' && action === 'stop') {
      sendJson(res, 200, await projectsApi.stop(id));
      return;
    }
    if (method === 'POST' && action === 'restart') {
      sendJson(res, 200, await projectsApi.restart(id));
      return;
    }
    if (method === 'POST' && action === 'update') {
      sendJson(res, 200, await projectsApi.update(id));
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: `未知端点：${method} ${pathname}` });
}

/**
 * 静态资源服务。只服务 public/ 下的文件，且防目录穿越。
 *
 * @param {http.ServerResponse} res
 * @param {string} pathname
 */
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);

  // 防穿越：解析后的绝对路径必须位于 PUBLIC_DIR 之内
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: '禁止访问' });
    return;
  }

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: '文件不存在' });
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };

  res.writeHead(200, {
    'Content-Type': types[ext] ?? 'application/octet-stream',
    // 看板开发期禁用缓存，改完刷新即生效
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      // 防恶意大 body：1MB 足够放一个路径
      if (raw.length > 1024 * 1024) {
        resolve(null);
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {any} body
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}
