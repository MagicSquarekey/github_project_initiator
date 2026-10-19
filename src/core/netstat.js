/**
 * 端口占用查询。
 *
 * 本文件是 core/platform.js 的兼容包装：早期版本只有 Windows 实现，
 * 测试与调用点都建立在 netstat 语义上。平台适配逻辑已统一收到
 * core/platform.js，这里保留导出名不变，让现有调用与测试无需改动。
 */

import {
  parseNetstatPids as parsePidsOnPortImpl,
  parseSsPids,
  parseLsofPids,
  pidsOnPort as pidsOnPortImpl,
  pidsOnPorts as pidsOnPortsImpl,
  pidsByImageName as pidsByImageNameImpl,
  imageNameOfPid as imageNameOfPidImpl,
} from './platform.js';

/**
 * 从 netstat -ano 输出解析监听指定端口的 PID 集合。
 *
 * @param {string} netstatOutput
 * @param {number} port
 * @returns {number[]}
 */
export function parsePidsOnPort(netstatOutput, port) {
  return parsePidsOnPortImpl(netstatOutput, port);
}

export { parseSsPids, parseLsofPids };

/**
 * 查询本机监听某端口的 PID 列表（跨平台）。
 *
 * @param {number} port
 * @returns {Promise<number[]>}
 */
export async function pidsOnPort(port) {
  return pidsOnPortImpl(port);
}

/**
 * 查询多个端口上监听的 PID 并集。
 *
 * @param {number[]} ports
 * @returns {Promise<number[]>}
 */
export async function pidsOnPorts(ports) {
  return pidsOnPortsImpl(ports);
}

/**
 * 按镜像名查 PID（跨平台）。
 *
 * @param {string} imageName
 * @returns {Promise<number[]>}
 */
export async function pidsByImageName(imageName) {
  return pidsByImageNameImpl(imageName);
}

/**
 * 获取占用某端口的进程的可读描述。
 *
 * @param {number} pid
 * @returns {Promise<string|null>}
 */
export async function imageNameOfPid(pid) {
  return imageNameOfPidImpl(pid);
}
