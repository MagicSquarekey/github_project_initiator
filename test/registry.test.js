/**
 * 注册表校验测试。
 *
 * 校验必须严（写坏了一启动就报错）且报错要具体（指出哪个项目哪个字段），
 * 这些测试锁定的就是"该拒的拒得掉、该放的放得过"。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  validateRegistry,
  expandPath,
  MANAGER_PORT,
  ROOT,
  buildSelfProject,
  SELF_PROJECT_ID,
  SELF_PROJECT_NAME,
} from '../src/core/registry.js';

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

test('java-service 是合法 kind（Elasticsearch 等 JVM 服务）', () => {
  const r = check([validProject({ kind: 'java-service' })]);
  assert.equal(r.valid, true, r.errors.join('\n'));
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

test('self 条目是唯一允许使用管理器端口的项目', () => {
  const self = buildSelfProject();
  assert.equal(self.port, MANAGER_PORT);
  assert.equal(self.ports, undefined);
  const r = check([self]);
  assert.equal(r.valid, true, r.errors.join('\n'));
});

test('self 条目固定为只观察、不可启停、不参与更新', () => {
  const self = buildSelfProject();
  assert.equal(self.id, SELF_PROJECT_ID);
  assert.equal(self.name, SELF_PROJECT_NAME);
  assert.equal(self.self, true);
  assert.equal(self.kind, 'observe-only');
  assert.equal(self.path, ROOT);
  assert.equal(self.start.command, null);
  assert.equal(self.stop.strategy, 'none');
  assert.equal(self.update.strategy, 'none');
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

/* ---------------- 开源数据隔离：可移植路径 ---------------- */

test('expandPath：~ 展开为用户主目录', () => {
  const home = os.homedir();
  assert.equal(expandPath('~/Desktop/LibreTV'), path.join(home, 'Desktop/LibreTV'));
  assert.equal(expandPath('~'), home);
});

test('expandPath：${ENV} 展开为环境变量', () => {
  process.env.GPI_TEST_HOME = 'X:/fake-home';
  try {
    assert.equal(expandPath('${GPI_TEST_HOME}/proj'), 'X:/fake-home/proj');
  } finally {
    delete process.env.GPI_TEST_HOME;
  }
});

test('expandPath：未定义的环境变量原样保留', () => {
  assert.equal(expandPath('${NOT_DEFINED_XYZ}/a'), '${NOT_DEFINED_XYZ}/a');
});

test('expandPath：绝对路径不受影响', () => {
  assert.equal(expandPath('C:/projects/a'), 'C:/projects/a');
  assert.equal(expandPath('/opt/a'), '/opt/a');
});

test('expandPath：非字符串原样返回', () => {
  assert.equal(expandPath(undefined), undefined);
  assert.equal(expandPath(null), null);
});

test('示例配置存在、合法且不含个人绝对路径', () => {
  const examplePath = path.join(ROOT, 'data', 'registry.example.json');
  assert.ok(fs.existsSync(examplePath), 'data/registry.example.json 必须入库');

  const raw = fs.readFileSync(examplePath, 'utf8');
  // 不允许出现 C:/Users/<name>、/home/<name>、/Users/<name>
  assert.doesNotMatch(raw, /[A-Za-z]:[\/]+Users[\/]+[^\/\s"'<]+/, '示例不得包含本机用户路径');
  assert.doesNotMatch(raw, /\/(?:home|Users)\/[^\/\s"'<]+/, '示例不得包含 POSIX 用户路径');
  // 应使用可移植写法
  assert.match(raw, /"~\/Desktop\//, '示例路径应使用 ~/ 前缀');

  const data = JSON.parse(raw);
  const r = validateRegistry(data);
  assert.equal(r.valid, true, r.errors.join('\n'));
});

test('本机 registry.json 不得被 git 跟踪（数据隔离）', () => {
  let tracked = '';
  try {
    tracked = execFileSync('git', ['ls-files', 'data/registry.json'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return; // 非 git 环境跳过
  }
  assert.equal(tracked, '', 'data/registry.json 含本机路径，必须被 .gitignore 排除');
});
