/**
 * 三级状态探测：TCP / 进程名 / PID，任一命中即算运行中。
 *
 * 刻意不做 HTTP 探活：探活要等首字节，慢，且可能被路由 404 干扰。
 * TCP 连上就说明端口在监听，对"启停"这个目的足够。
 */

import net from 'node:net';
import { pidsByImageName } from './netstat.js';

/**
 * TCP 连接测试：能连上说明端口在监听。
 *
 * @param {number} port
 * @param {string} [host]
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export function isPortOpen(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    socket.connect(port, host);
  });
}

/**
 * 批量探测端口，任一开放即返回 true。
 *
 * @param {number[]} ports
 * @returns {Promise<boolean>}
 */
export async function anyPortOpen(ports) {
  for (const port of ports) {
    if (await isPortOpen(port)) return true;
  }
  return false;
}

/**
 * 按镜像名探测进程是否存活。
 *
 * @param {string} imageName
 * @returns {Promise<boolean>}
 */
export async function isProcessRunning(imageName) {
  return (await pidsByImageName(imageName)).length > 0;
}

/**
 * PID 存活探测（process.kill(pid, 0) 不抛错即活着）。
 *
 * @param {number|null|undefined} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
  if (!pid || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM 表示进程存在但无权发信号——也算活着
    return err.code === 'EPERM';
  }
}

/**
 * 综合探测一个项目是否在运行。
 *
 * 优先级：端口（最可靠）→ 进程名 → PID。
 * 返回值带上判定依据，便于看板提示用户"这个状态是怎么来的"。
 *
 * @param {any} project registry 中的项目条目
 * @returns {Promise<{ running: boolean, via: 'port'|'procname'|'pid'|null, pids: number[] }>}
 */
export async function probeProject(project) {
  // 端口来源有四处（ports / port / stop.ports / stop.port），同一端口常被重复声明
  // （如 backend 的 8686 同时出现在 port 和 stop.port），必须去重后再探测。
  const portSet = new Set([
    ...(Array.isArray(project.ports) ? project.ports : []),
    ...(project.port ? [project.port] : []),
    ...(Array.isArray(project.stop?.ports) ? project.stop.ports : []),
    ...(project.stop?.port ? [project.stop.port] : []),
  ]);
  const ports = [...portSet].filter(Number.isInteger);

  // 1. 端口探测
  if (ports.length > 0) {
    const open = [];
    for (const port of ports) {
      if (await isPortOpen(port)) open.push(port);
    }
    if (open.length > 0) {
      return { running: true, via: 'port', openPorts: open, pids: [] };
    }
  }

  // 2. 进程名探测
  const imageName = project.stop?.imageName;
  if (imageName) {
    const pids = await pidsByImageName(imageName);
    if (pids.length > 0) {
      return { running: true, via: 'procname', openPorts: [], pids };
    }
  }

  // 3. PID 探测（管理器自己启动且拿到了 PID 时）
  if (project.state?.pid && isPidAlive(project.state.pid)) {
    return { running: true, via: 'pid', openPorts: [], pids: [project.state.pid] };
  }

  return { running: false, via: null, openPorts: [], pids: [] };
}
