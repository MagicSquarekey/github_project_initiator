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
import { MANAGER_PORT, VERSION } from './core/registry.js';
import * as projectsApi from './api/projects.js';
import * as manageApi from './api/manage.js';
import { scanForProjects } from './api/scan.js';
import { inspectDirectory } from './api/inspect.js';
import { browseDirectories } from './api/browse.js';
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

    // CORS：只放行本机来源（看板自身、file:// 打开、本地其他端口开发）。
    // 新增的目录浏览接口会暴露目录结构，不能再对任意网站开放。
    setCors(req, res);

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
    sendJson(res, 200, {
      ok: true,
      version: VERSION,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.floor(process.uptime()),
    });
    return;
  }

  // GET /api/projects —— 全量状态（看板轮询用）
  if (method === 'GET' && pathname === '/api/projects') {
    sendJson(res, 200, await projectsApi.describeAll());
    return;
  }

  // POST /api/projects —— 添加监测项目（写 registry.json）
  if (method === 'POST' && pathname === '/api/projects') {
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'BAD_REQUEST', message: '请求体不是合法 JSON' });
      return;
    }
    try {
      const project = manageApi.addProject(body);
      sendJson(res, 201, { ok: true, project, message: `已添加 ${project.name}` });
    } catch (err) {
      if (err.code === 'INVALID_PROJECT') {
        sendJson(res, 400, {
          ok: false,
          error: err.code,
          message: err.message,
          errors: err.errors ?? [err.message],
        });
        return;
      }
      throw err;
    }
    return;
  }

  // GET /api/inspect?path=... —— 识别单个目录，供添加表单预填
  if (method === 'GET' && pathname === '/api/inspect') {
    const target = url.searchParams.get('path');
    if (!target) {
      sendJson(res, 400, { ok: false, error: 'BAD_REQUEST', message: '缺少 path 参数' });
      return;
    }
    const info = inspectDirectory(target);
    sendJson(res, 200, { ok: info.exists !== false, ...info });
    return;
  }

  // GET /api/browse?path=... —— 文件夹选择器（只列目录）
  if (method === 'GET' && pathname === '/api/browse') {
    const target = url.searchParams.get('path') ?? '';
    sendJson(res, 200, { ok: true, ...browseDirectories(target) });
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
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'BAD_REQUEST', message: '请求体不是合法 JSON' });
      return;
    }
    const depth = Number(body?.maxDepth);
    const result = await scanForProjects(
      body?.root,
      Number.isInteger(depth) && depth >= 0 && depth <= 5 ? depth : 2,
    );
    sendJson(res, 200, { ok: !result.error, ...result });
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

    // DELETE /api/projects/:id —— 从看板移除（只改 registry，不删文件）
    if (method === 'DELETE' && !action) {
      try {
        const removed = manageApi.removeProject(id);
        sendJson(res, 200, { ok: true, removed, message: `已移除 ${removed.name}` });
      } catch (err) {
        if (err.code === 'NOT_FOUND') {
          sendJson(res, 404, { ok: false, error: err.code, message: err.message });
          return;
        }
        if (err.code === 'FORBIDDEN') {
          sendJson(res, 403, { ok: false, error: err.code, message: err.message });
          return;
        }
        if (err.code === 'INVALID_PROJECT') {
          sendJson(res, 400, { ok: false, error: err.code, message: err.message });
          return;
        }
        throw err;
      }
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
 * 只给本机来源发 CORS 头。
 *
 * 为什么收紧：`Access-Control-Allow-Origin: *` 会让任意网站用 fetch 读取
 * /api/browse 的目录结构、甚至 POST 添加项目。管理器没有鉴权，
 * 所以必须把"本机"作为唯一信任边界。
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const origin = req.headers.origin;
  if (!origin) return; // 同源请求 / curl 不需要 CORS

  let allowed = origin === 'null'; // file:// 打开看板时浏览器发送 Origin: null
  if (!allowed) {
    try {
      const host = new URL(origin).hostname;
      allowed = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host);
    } catch {
      allowed = false;
    }
  }

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
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
