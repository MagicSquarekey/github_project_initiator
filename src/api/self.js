/**
 * 管理器自身的重启 / 更新。
 *
 * 为什么不复用项目级动作：
 *   - 项目的 restart 是 stop→start，管理器不能先把自己停掉；
 *   - self 条目的 update.strategy 是 none（见 buildSelfProject），
 *     直接 updateProject(self) 会被拒绝，所以这里构造一个合成项目走 git 分支。
 */

import { ROOT, buildSelfProject } from '../core/registry.js';
import { gitSnapshot } from '../core/git.js';
import { updateProject } from '../core/update.js';
import { preflightNewCode, scheduleSelfRestart } from '../core/selfControl.js';
import { logger } from '../util/logger.js';

/** 同一时间只允许一个自管理动作；重启安排成功后进程会退出，不需要复位 */
let busy = false;

const BUSY_MESSAGE = '管理器正在重启或更新，请稍候';

/**
 * 重启管理器自己。
 *
 * @returns {Promise<{ ok: boolean, message: string, mode?: string }>}
 */
export async function restartSelf() {
  if (busy) return { ok: false, message: BUSY_MESSAGE };
  busy = true;

  const res = await scheduleSelfRestart({ reason: 'dashboard' });
  if (!res.ok) {
    busy = false;
    return { ok: false, message: res.message || '重启失败' };
  }
  return {
    ok: true,
    mode: res.mode,
    message: res.mode === 'systemd' ? '正在退出，systemd 将在几秒内拉起新进程…' : '正在重启，看板会断开几秒…',
  };
}

/**
 * 更新管理器自己：git 更新 → 自检新代码 → 重启。
 *
 * 已是最新时不重启；自检失败时保留旧进程继续服务（宁可不更新，也不能把看板搞死）。
 *
 * @returns {Promise<{ ok: boolean, message: string, updated?: boolean, restarted?: boolean, from?: string, to?: string }>}
 */
export async function updateSelf() {
  if (busy) return { ok: false, message: BUSY_MESSAGE };
  busy = true;

  try {
    const before = await gitSnapshot(ROOT);
    if (!before.isRepo) {
      busy = false;
      return { ok: false, message: '管理器目录不是 git 仓库，无法自动更新' };
    }
    if (!before.branch) {
      busy = false;
      return { ok: false, message: '管理器处于 detached HEAD，无法自动更新' };
    }

    const project = {
      ...buildSelfProject(),
      // self 条目本身是 strategy:'none'；这里临时改成 git，复用现成的更新流程
      update: { strategy: 'git', remote: before.remotes?.[0] ?? 'origin', branch: before.branch },
    };

    logger.info('开始自更新', { branch: before.branch, head: before.head?.sha ?? null });
    const res = await updateProject(project);
    if (!res.ok) {
      busy = false;
      logger.warn('自更新失败', { message: res.message });
      return { ok: false, message: res.message };
    }

    if (res.alreadyUpToDate) {
      busy = false;
      return { ok: true, updated: false, restarted: false, message: '已是最新，无需重启' };
    }

    // 自检：新代码先在随机端口起一个临时实例，起不来就不重启
    const pre = await preflightNewCode();
    if (!pre.ok) {
      busy = false;
      return {
        ok: false,
        updated: true,
        restarted: false,
        message: `代码已更新，但新代码自检失败，未重启（旧进程继续服务）。${pre.detail ? `\n${pre.detail}` : ''}`,
      };
    }

    const after = await gitSnapshot(ROOT);
    const restart = await scheduleSelfRestart({ reason: 'self-update' });
    if (!restart.ok) {
      busy = false;
      return { ok: false, updated: true, restarted: false, message: restart.message || '重启失败' };
    }

    logger.info('自更新完成，正在重启', {
      from: before.head?.sha ?? null,
      to: after.head?.sha ?? null,
    });

    return {
      ok: true,
      updated: true,
      restarted: true,
      from: before.head?.sha ?? null,
      to: after.head?.sha ?? null,
      message: `已更新到 ${after.head?.sha?.slice(0, 7) ?? '最新版本'}，正在重启…`,
    };
  } catch (err) {
    busy = false;
    logger.error('自更新异常', { error: err.message });
    return { ok: false, message: `自更新失败：${err.message}` };
  }
}
