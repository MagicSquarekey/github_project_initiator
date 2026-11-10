/**
 * 监听地址解析。
 *
 * 部署脚本会把多个地址写进一个环境变量：
 *   GPI_HOST=127.0.0.1,100.65.61.59,192.168.31.96
 * Node 的 server.listen(port, host) 只接受单个地址，整串传进去会被当主机名解析，
 * 结果 EAI_NONAME → 启动失败。这里拆成列表，由 index.js 每个地址起一个 server。
 */

/** 0.0.0.0 / :: 已经覆盖全部网卡，和具体地址混绑会 EADDRINUSE */
const ALL_INTERFACES = new Set(['0.0.0.0', '::']);

/**
 * @param {string|undefined|null} raw GPI_HOST 的原始值
 * @returns {string[]} 去重后的监听地址列表，默认 127.0.0.1
 */
export function parseListenHosts(raw) {
  const list = String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0) return ['127.0.0.1'];

  const wildcard = list.find((h) => ALL_INTERFACES.has(h));
  if (wildcard) return [wildcard];

  return [...new Set(list)];
}
