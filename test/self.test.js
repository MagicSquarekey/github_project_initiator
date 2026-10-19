/**
 * 管理器自身纳入监测的测试。
 *
 * 自身条目的特殊性：
 *   - 状态不靠探测，请求能到 API 就说明进程活着；
 *   - 不能被看板启停/更新（停止自己 = 看板消失）；
 *   - 运行时长来自进程本身，而不是管理器的启动记录。
 */

import test from 'node:test';
import assert from 'node:assert';
import { buildSelfProject, MANAGER_PORT } from '../src/core/registry.js';
import { probeProject } from '../src/core/probe.js';
import { describeProject, guardSelfAction } from '../src/api/projects.js';

test('自身条目始终判定为运行中，PID 就是当前进程', async () => {
  const r = await probeProject(buildSelfProject());
  assert.equal(r.running, true);
  assert.equal(r.via, 'self');
  assert.deepEqual(r.pids, [process.pid]);
  assert.deepEqual(r.openPorts, [MANAGER_PORT]);
});

test('自身条目在看板中不可启停、不可更新，运行时长来自进程', async () => {
  const d = await describeProject(buildSelfProject());
  assert.equal(d.self, true);
  assert.equal(d.running, true);
  assert.equal(d.runningVia, 'self');
  assert.equal(d.startable, false);
  assert.equal(d.updatable, false);
  assert.deepEqual(d.ports, [MANAGER_PORT]);
  assert.ok(Number.isInteger(d.uptimeSec) && d.uptimeSec >= 0);
});

test('自身的生命周期动作被明确拒绝，普通项目不受影响', () => {
  const self = buildSelfProject();
  for (const action of ['start', 'stop', 'restart', 'update']) {
    const r = guardSelfAction(self, action);
    assert.equal(r?.ok, false, `${action} 应被拒绝`);
    assert.ok(r?.message, `${action} 应有说明`);
  }
  assert.equal(guardSelfAction({ id: 'demo' }, 'stop'), null);
});
