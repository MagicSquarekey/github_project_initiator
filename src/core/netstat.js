/**
 * 端口占用查询：从 netstat 输出解析出监听某端口的 PID 列表。
 *
 * 这是"停止"能力的基石。Node 没有内置 API 查端口占用，Windows 上三条路：
 *   netstat -ano           ← 采用，零依赖，输出格式稳定
 *   Get-NetTCPConnection   ← 结构化，但每次都要起 PowerShell，慢
 *   npm 包                 ← 为零依赖原则不引
 *
 * 已知坑（都有测试覆盖）：
 *   1. :8090 会误匹配 :80901 / :18090 —— 必须要求端口后紧跟空白或行尾
 *   2. 同一端口常有 IPv4(0.0.0.0) 和 IPv6([::]) 两条 LISTENING，PID 相同，要去重
 *   3. netstat 输出受代码页影响，只取 ASCII 数字列，不做本地化假设
 */

import { exec } from '../util/exec.js';

/**
 * 从 netstat 原始输出中解析监听指定端口的 PID 集合。
 *
 * 导出为纯函数是为了能脱离 Windows 单测——解析逻辑正是最容易出错的部分。
 *
 * @param {string} netstatOutput netstat -ano 的 stdout
 * @param {number} port 目标端口
 * @returns {number[]} 去重后的 PID 列表
 */
export function parsePidsOnPort(netstatOutput, port) {
  if (!netstatOutput) return [];

  // 形如：
  //   TCP    0.0.0.0:8090          0.0.0.0:0              LISTENING       51392
  //   TCP    [::]:8090              [::]:0                 LISTENING       51392
  //   TCP    127.0.0.1:8790        0.0.0.0:0              LISTENING       42704
  // 协议列之后是 本地地址 / 外部地址 / 状态 / PID。
  // 端口必须紧跟空白或行尾，避免 :8090 命中 :80901。
  const re = new RegExp(
    `^\\s*(?:TCP|TCP6)\\s+\\S+:${port}(?:\\s|$)\\S*\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`,
    'gim',
  );

  const pids = new Set();
  for (const m of netstatOutput.matchAll(re)) {
    const pid = Number.parseInt(m[1], 10);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids].sort((a, b) => a - b);
}

/**
 * 查询本机监听某端口的 PID 列表。
 *
 * @param {number} port
 * @returns {Promise<number[]>}
 */
export async function pidsOnPort(port) {
  const r = await exec('netstat', ['-ano']);
  if (!r.ok) {
    // netstat 不在 PATH 或执行失败：宁可返回空让上层走兜底，也不抛错中断流程
    return [];
  }
  return parsePidsOnPort(r.stdout, port);
}

/**
 * 查询多个端口上监听的 PID 并集（AutoTestHub 这类双服务项目用）。
 *
 * @param {number[]} ports
 * @returns {Promise<number[]>}
 */
export async function pidsOnPorts(ports) {
  const all = new Set();
  for (const port of ports) {
    for (const pid of await pidsOnPort(port)) all.add(pid);
  }
  return [...all].sort((a, b) => a - b);
}

/**
 * 用 tasklist 按镜像名查 PID。
 *
 * @param {string} imageName 例如 "wb2api.exe"
 * @returns {Promise<number[]>}
 */
export async function pidsByImageName(imageName) {
  const r = await exec('tasklist', ['/fi', `imagename eq ${imageName}`, '/nh', '/fo', 'csv']);
  if (!r.ok) return [];

  // tasklist /fo /csv 输出：
  //   "wb2api.exe","12345","Console","1","50,000 K"
  // 无匹配时返回一行提示信息（本地化，不能解析），靠 "没有运行的任务" 之外的启发式判断：
  // 只要出现 "数字,数字 K" 形式的内存列，就认为有匹配行。
  const pids = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!line.includes('"')) continue;
    const cells = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1));
    if (!cells || cells.length < 2) continue;
    const name = cells[0];
    if (name?.toLowerCase() !== imageName.toLowerCase()) continue;
    const pid = Number.parseInt(cells[1], 10);
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
  }
  return [...new Set(pids)].sort((a, b) => a - b);
}

/**
 * 获取占用某端口的进程的可读描述（用于错误提示"端口被谁占了"）。
 *
 * @param {number} pid
 * @returns {Promise<string|null>} 例如 "node.exe" 或 null
 */
export async function imageNameOfPid(pid) {
  const r = await exec('tasklist', ['/fi', `pid eq ${pid}`, '/nh', '/fo', 'csv']);
  if (!r.ok) return null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const cells = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1));
    if (cells?.[0] && Number.parseInt(cells[1], 10) === pid) return cells[0];
  }
  return null;
}
