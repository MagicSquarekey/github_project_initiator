/**
 * 注册表校验测试。
 *
 * 校验必须严（写坏了一启动就报错）且报错要具体（指出哪个项目哪个字段），
 * 这些测试锁定的就是"该拒的拒得掉、该放的放得过"。
 */

import test from 'node:test';
import assert from 'node:assert';
import { validateRegistry, MANAGER_PORT } from '../src/core/registry.js';

/** 一个合法的最小项目 */
function validProject(over = {}) {
  return {
    id: 'demo',
    name: 'Demo',
    path: 'C:/tmp/demo',
    kind: 'node-service',
    start: { command: 'cmd.exe', args: ['/c', 'start.bat'], detached: true },
    stop: { strategy: 'port', port: 4000 },
    url: 'http://127.0.0.1:4000',
    port: 4000,
    startupTimeoutMs: 60000,
    update: { strategy: 'git', remote: 'origin', branch: 'main' },
    ...over,
  };
}

function check(projects) {
  return validateRegistry({ version: 1, projects });
}

test('合法配置通过', () => {
  const r = check([validProject()]);
  assert.equal(r.valid, true, r.errors.join('\n'));
});

test('多个合法项目通过', () => {
  const r = check([
    validProject({ id: 'a', port: 4000, stop: { strategy: 'port', port: 4000 } }),
    validProject({ id: 'b', port: 4001, stop: { strategy: 'port', port: 4001 } }),
  ]);
  assert.equal(r.valid, true, r.errors.join('\n'));
});

test('version 必须是 1', () => {
  const r = validateRegistry({ version: 2, projects: [] });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /version/);
});

test('projects 必须是数组', () => {
  const r = validateRegistry({ version: 1, projects: 'nope' });
  assert.equal(r.valid, false);
});

test('id 格式受限且不能重复', () => {
  assert.match(check([validProject({ id: 'Bad_Id' })]).errors.join(), /id/);
  assert.equal(check([validProject({ id: 'ok-id' })]).valid, true);

  const dup = check([validProject({ id: 'a' }), validProject({ id: 'a', port: 4001 })]);
  assert.equal(dup.valid, false);
  assert.match(dup.errors.join(), /重复/);
});

test('kind 必须在白名单内', () => {
  const r = check([validProject({ kind: 'quantum-service' })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /kind/);
});

test('非法端口号被拒', () => {
  for (const bad of [0, -1, 70000, 3.5, '4000', null]) {
    const r = check([validProject({ port: bad, stop: { strategy: 'port', port: bad } })]);
    assert.equal(r.valid, false, `port=${bad} 应被拒绝`);
  }
});

test('被管项目不能占用管理器自身端口', () => {
  const r = check([validProject({ port: MANAGER_PORT })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), new RegExp(String(MANAGER_PORT)));
});

test('两个不同项目不能占同一端口', () => {
  const r = check([validProject({ id: 'a', port: 4000 }), validProject({ id: 'b', port: 4000 })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /4000/);
});

test('同一项目多处声明同一端口不算冲突', () => {
  // backend 的 8686 同时出现在 port 和 stop.port，这是合法的
  const r = check([
    validProject({ port: 8686, stop: { strategy: 'port', port: 8686 }, ports: [8686] }),
  ]);
  assert.equal(r.valid, true, r.errors.join('\n'));
});

test('strategy=port 必须有端口', () => {
  const r = check([validProject({ stop: { strategy: 'port' }, port: undefined })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /port/);
});

test('strategy=procname 的 imageName 必须以 .exe 结尾', () => {
  assert.equal(
    check([validProject({ stop: { strategy: 'procname', imageName: 'app' } })]).valid,
    false,
  );
  assert.equal(
    check([validProject({ stop: { strategy: 'procname', imageName: 'app.exe' } })]).valid,
    true,
  );
});

test('strategy=command 必须有 command', () => {
  const r = check([validProject({ stop: { strategy: 'command' } })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /command/);
});

test('未知 stop 策略被拒', () => {
  const r = check([validProject({ stop: { strategy: 'teleport' } })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /strategy/);
});

test('未知 update 策略被拒', () => {
  const r = check([validProject({ update: { strategy: 'yolo' } })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /strategy/);
});

test('cli-tool 允许 start.command 为 null', () => {
  const r = check([
    validProject({
      kind: 'cli-tool',
      start: { command: null, args: [] },
      stop: { strategy: 'none' },
      port: undefined,
    }),
  ]);
  assert.equal(r.valid, true, r.errors.join('\n'));
});

test('observe-only 允许 start.command 为 null', () => {
  const r = check([
    validProject({
      kind: 'observe-only',
      start: { command: null, args: [] },
      stop: { strategy: 'none' },
      port: undefined,
    }),
  ]);
  assert.equal(r.valid, true, r.errors.join('\n'));
});

test('普通 service 不允许 start.command 为 null', () => {
  const r = check([validProject({ start: { command: null, args: [] } })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /cli-tool|observe-only/);
});

test('command 非空时 args 必须是数组', () => {
  const r = check([validProject({ start: { command: 'cmd.exe', args: 'x' } })]);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(), /args/);
});

test('startupTimeoutMs 必须是非负数', () => {
  assert.equal(check([validProject({ startupTimeoutMs: -1 })]).valid, false);
  assert.equal(check([validProject({ startupTimeoutMs: 0 })]).valid, true);
});

test('错误信息带项目 id 便于定位', () => {
  const r = check([validProject({ id: 'libretv', kind: 'bogus' })]);
  assert.match(r.errors.join(), /libretv/);
});
