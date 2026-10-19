/**
 * 管理器入口。
 *
 * 职责：加载注册表 → 起 HTTP 服务 → 起后台定时任务 → 优雅退出。
 *
 * 刻意不做的事：
 *   - 不自动启动被管项目（启动是显式动作，开机自启交给可选的计划任务脚本）
 *   - 不做"崩溃自动重启"（被管项目的崩溃原因千差万别，自动重启可能掩盖问题）
 */

import { createServer } from './server.js';
import { loadRegistry, MANAGER_PORT } from './core/registry.js';
import { describeAll } from './api/projects.js';
import { fetch } from './core/git.js';
import { logger } from './util/logger.js';

/** 后台 git fetch 间隔：5 分钟。频繁 fetch 对 GitHub 是无谓压力 */
const FETCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 后台刷新所有 git 仓库的 remote 状态。
 *
 * 只在启动时做一次全量，之后每 5 分钟增量。
 * 串行而非并行：并发 fetch 会互相抢占网络，且本项目数量少，串行足够快。
 */
async function refreshGitRemotes() {
  const { projects } = loadRegistry();
  // 自身条目 update 策略是 none（不能在看板里更新自己），但它的落后提交数
  // 仍然值得展示，所以也要后台 fetch——只刷新 remote，不触发 pull。
  const repos = projects.filter(
    (p) => (p.update?.strategy !== 'none' || p.self === true) && p.path,
  );

  logger.debug('后台刷新 git remote 状态', { count: repos.length });

  for (const p of repos) {
    try {
      await fetch(p.path, p.update?.remote ?? 'origin');
    } catch (err) {
      // 单个仓库 fetch 失败（断网、remote 失效）不影响其他项目
      logger.debug('后台 fetch 失败', { id: p.id, error: err.message });
    }
  }
}

async function main() {
  // 启动即校验注册表：配置写坏要让用户立刻知道，而不是等点到某个项目才报错
  const registry = loadRegistry();
  logger.info('注册表加载成功', { projects: registry.projects.length });

  // 预跑一次状态聚合，尽早暴露探测层的问题
  try {
    const { projects } = await describeAll();
    const running = projects.filter((p) => p.running).length;
    logger.info('初始状态采集完成', { total: projects.length, running });
  } catch (err) {
    logger.warn('初始状态采集失败（不影响启动）', { error: err.message });
  }

  // 后台刷新 remote（不阻塞服务就绪）
  void refreshGitRemotes().then(() => {
    setInterval(() => void refreshGitRemotes(), FETCH_INTERVAL_MS);
  });

  const server = createServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`端口 ${MANAGER_PORT} 已被占用，管理器无法启动`, { port: MANAGER_PORT });
      process.exit(1);
    }
    logger.error('HTTP 服务错误', { error: err.message });
    process.exit(1);
  });

  server.listen(MANAGER_PORT, '127.0.0.1', () => {
    logger.info(`管理器已启动：http://127.0.0.1:${MANAGER_PORT}`, { port: MANAGER_PORT });
    console.log('');
    console.log(`  github_project_initiator 管理面板`);
    console.log(`  http://127.0.0.1:${MANAGER_PORT}`);
    console.log('');
    console.log('  按 Ctrl+C 停止管理器（不影响已启动的项目）');
    console.log('');
  });

  // 优雅退出：管理器退出不该带走被管的 detached 子进程
  const shutdown = () => {
    logger.info('收到退出信号，管理器关闭');
    server.close(() => process.exit(0));
    // 强退兜底：3 秒内没关干净就退
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('管理器启动失败', { error: err.message });
  console.error(`\n启动失败：${err.message}\n`);
  process.exit(1);
});
