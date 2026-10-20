/**
 * 项目纳管逻辑测试。
 *
 * 重点不是"能保存"，而是"该拒的拒得掉"：
 *   - 目录不存在 / 重复纳管 / 端口冲突必须拒绝；
 *   - 服务类项目没有启动命令必须拒绝；
 *   - 自动生成的 id 要避让已有条目。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildProject,
  addProjectToRegistry,
  removeProjectFromRegistry,
  addProject,
  removeProject,
  slugify,
  uniqueId,
  parseArgs,
  parsePortList,
} from '../src/api/manage.js';
import { validateRegistry, loadRegistry, loadRegistryRaw, saveRegistry } from '../src/core/registry.js';

/** @returns {string} */
function tmpDir(prefix = 'gpi-manage-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function baseInput(dir, over = {}) {
  return {
    name: 'Demo App',
    path: dir,
    kind: 'node-service',
    startCommand: 'cmd.exe',
    startArgs: '/c start.bat',
    port: '45678',
    stopStrategy: 'port',
    updateStrategy: 'none',
    ...over,
  };
}

function validExisting(id, dir, over = {}) {
  return {
    id,
    name: `Existing ${id}`,
    path: dir,
    kind: 'node-service',
    start: { command: 'cmd.exe', args: ['/c', 'start.bat'], detached: true },
    stop: { strategy: 'port', port: 45000 },
    url: 'http://127.0.0.1:45000',
    port: 45000,
    startupTimeoutMs: 60000,
    update: { strategy: 'none' },
    ...over,
  };
}

test('parseArgs：支持引号与空白', () => {
  assert.deepEqual(parseArgs('/c "start app.bat"'), ['/c', 'start app.bat']);
  assert.deepEqual(parseArgs("a 'b c' d"), ['a', 'b c', 'd']);
  assert.deepEqual(parseArgs(['x', 'y']), ['x', 'y']);
  assert.deepEqual(parseArgs(''), []);
  assert.deepEqual(parseArgs(null), []);
});

test('parsePortList：单值、多值、非法值', () => {
  assert.deepEqual(parsePortList('8080'), { ports: [8080], invalid: [] });
  assert.deepEqual(parsePortList('8686, 5173'), { ports: [8686, 5173], invalid: [] });
  assert.deepEqual(parsePortList([8080, 8080, 3000]), { ports: [8080, 3000], invalid: [] });
  assert.deepEqual(parsePortList('0, 70000, abc'), { ports: [], invalid: ['0', '70000', 'abc'] });
});

test('slugify / uniqueId：中文名退化为 project，冲突自动加序号', () => {
  assert.equal(slugify('Demo App'), 'demo-app');
  assert.equal(slugify('LibreTV'), 'libretv');
  assert.equal(slugify('中文项目'), 'project');
  assert.equal(uniqueId('demo', []), 'demo');
  assert.equal(uniqueId('demo', ['demo']), 'demo-2');
  assert.equal(uniqueId('demo', ['demo', 'demo-2']), 'demo-3');
});

test('最小输入能生成合法项目（默认值齐全）', () => {
  const dir = tmpDir();
  const { project, errors } = buildProject(baseInput(dir), []);
  assert.deepEqual(errors, [], errors.join('\n'));

  assert.equal(project.id, 'demo-app');
  assert.equal(project.path, dir, '路径按用户输入原样保存');
  assert.deepEqual(project.start, { command: 'cmd.exe', args: ['/c', 'start.bat'], detached: true });
  assert.deepEqual(project.stop, { strategy: 'port', port: 45678 });
  assert.equal(project.port, 45678);
  assert.equal(project.url, 'http://127.0.0.1:45678');
  assert.equal(project.startupTimeoutMs, 120000);
  assert.deepEqual(project.update, { strategy: 'none' });

  const v = validateRegistry({ version: 1, projects: [project] });
  assert.equal(v.valid, true, v.errors.join('\n'));
});

test('多端口：首个作为主端口，全部用于停止', () => {
  const dir = tmpDir();
  const { project, errors } = buildProject(baseInput(dir, { port: '8686, 5173' }), []);
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.equal(project.port, 8686);
  assert.deepEqual(project.ports, [8686, 5173]);
  assert.deepEqual(project.stop, { strategy: 'port', ports: [8686, 5173] });
  assert.equal(project.url, 'http://127.0.0.1:8686');
});

test('自动 id 避让已有条目', () => {
  const dir = tmpDir();
  const other = tmpDir();
  const { project, errors } = buildProject(
    baseInput(dir, { name: 'Demo' }),
    [validExisting('demo', other)],
  );
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.equal(project.id, 'demo-2');
});

test('显式 id 重复时拒绝，而不是静默改名', () => {
  const dir = tmpDir();
  const other = tmpDir();
  const { errors } = buildProject(
    baseInput(dir, { id: 'demo' }),
    [validExisting('demo', other)],
  );
  assert.match(errors.join('\n'), /已存在/);
});

test('缺少名称 / 目录 / 目录不存在都被拒绝', () => {
  assert.match(buildProject({ path: tmpDir(), kind: 'node-service' }, []).errors.join(), /名称/);
  assert.match(buildProject({ name: 'X', kind: 'node-service' }, []).errors.join(), /目录/);
  assert.match(
    buildProject(baseInput(path.join(os.tmpdir(), 'definitely-not-exists-gpi')), []).errors.join(),
    /不存在/,
  );
});

test('同一目录不能重复纳管，同名也不能重复', () => {
  const dir = tmpDir();
  const existing = validExisting('demo', dir, { name: 'Demo App' });

  const dupPath = buildProject(baseInput(dir, { name: 'Another' }), [existing]);
  assert.match(dupPath.errors.join('\n'), /已由项目 "demo" 管理/);

  const other = tmpDir();
  const dupName = buildProject(baseInput(other, { name: 'Demo App' }), [existing]);
  assert.match(dupName.errors.join('\n'), /名称 "Demo App" 已存在/);
});

test('服务类项目必须有启动命令；observe-only / cli-tool 可以没有', () => {
  const dir = tmpDir();
  const missing = buildProject(baseInput(dir, { startCommand: '' }), []);
  assert.match(missing.errors.join('\n'), /启动命令必填/);

  for (const kind of ['observe-only', 'cli-tool']) {
    const r = buildProject(baseInput(dir, { kind, startCommand: '', port: '', stopStrategy: 'none' }), []);
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
    assert.equal(r.project.start.command, null);
    assert.deepEqual(r.project.stop, { strategy: 'none' });
  }
});

test('procname / command 停止方式缺字段时拒绝', () => {
  const dir = tmpDir();
  const proc = buildProject(baseInput(dir, { stopStrategy: 'procname', stopImageName: '' }), []);
  assert.match(proc.errors.join('\n'), /进程名/);

  const cmd = buildProject(baseInput(dir, { stopStrategy: 'command', stopCommand: '' }), []);
  assert.match(cmd.errors.join('\n'), /停止命令/);

  const ok = buildProject(
    baseInput(dir, { stopStrategy: 'procname', stopImageName: 'app.exe' }),
    [],
  );
  assert.deepEqual(ok.errors, [], ok.errors.join('\n'));
  assert.deepEqual(ok.project.stop, { strategy: 'procname', imageName: 'app.exe' });
});

test('端口与已有项目冲突时拒绝', () => {
  const dir = tmpDir();
  const other = tmpDir();
  const { errors } = buildProject(
    baseInput(dir, { port: '45000' }),
    [validExisting('demo', other)],
  );
  assert.match(errors.join('\n'), /45000/);
});

test('update=git 补全 remote/branch', () => {
  const dir = tmpDir();
  const { project, errors } = buildProject(baseInput(dir, { updateStrategy: 'git' }), []);
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.deepEqual(project.update, { strategy: 'git', remote: 'origin', branch: 'main' });
});

test('纯函数新增不修改入参', () => {
  const dir = tmpDir();
  const data = { version: 1, projects: [] };
  const result = addProjectToRegistry(data, baseInput(dir));
  assert.deepEqual(result.errors, []);
  assert.equal(data.projects.length, 0, '原注册表不应被修改');
  assert.equal(result.data.projects.length, 1);
});

test('纯函数移除：manager 与不存在的 id 被拒绝', () => {
  const data = { version: 1, projects: [{ id: 'a', name: 'A' }] };
  assert.match(removeProjectFromRegistry(data, 'manager').error, /管理器自身/);
  assert.match(removeProjectFromRegistry(data, 'nope').error, /不存在/);
  assert.equal(removeProjectFromRegistry(data, 'a').removed.id, 'a');
});

test('addProject / removeProject 真正写盘（临时注册表）', () => {
  const registryFile = path.join(tmpDir('gpi-registry-'), 'registry.json');
  fs.writeFileSync(registryFile, JSON.stringify({ version: 1, projects: [] }), 'utf8');
  const dir = tmpDir();

  const previous = process.env.GPI_REGISTRY_FILE;
  process.env.GPI_REGISTRY_FILE = registryFile;
  try {
    const added = addProject(baseInput(dir));
    assert.equal(added.id, 'demo-app');

    const saved = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(saved.projects.length, 1);
    assert.equal(saved.projects[0].id, 'demo-app');

    assert.throws(() => removeProject('manager'), /管理器自身/);
    assert.throws(() => removeProject('nope'), /不存在/);

    const removed = removeProject('demo-app');
    assert.equal(removed.id, 'demo-app');
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).projects.length, 0);
  } finally {
    if (previous === undefined) delete process.env.GPI_REGISTRY_FILE;
    else process.env.GPI_REGISTRY_FILE = previous;
  }
});

test('首次运行创建空注册表，而不是复制作者的项目清单', () => {
  const registryFile = path.join(tmpDir('gpi-registry-first-'), 'registry.json');
  assert.equal(fs.existsSync(registryFile), false);

  const previous = process.env.GPI_REGISTRY_FILE;
  process.env.GPI_REGISTRY_FILE = registryFile;
  try {
    const data = loadRegistryRaw();
    assert.deepEqual(data, { version: 1, projects: [] });
    assert.ok(fs.existsSync(registryFile), '应创建注册表文件');
  } finally {
    if (previous === undefined) delete process.env.GPI_REGISTRY_FILE;
    else process.env.GPI_REGISTRY_FILE = previous;
  }
});

test('保存时只剥离合成 self，不误删用户手写 self', () => {
  const registryFile = path.join(tmpDir('gpi-registry-self-'), 'registry.json');
  const previous = process.env.GPI_REGISTRY_FILE;
  process.env.GPI_REGISTRY_FILE = registryFile;

  try {
    // 空注册表：loadRegistry 注入合成 self，保存时必须剥离
    fs.writeFileSync(registryFile, JSON.stringify({ version: 1, projects: [] }), 'utf8');
    const injected = loadRegistry();
    assert.equal(injected.projects.length, 1);
    assert.equal(injected.projects[0].id, 'manager');
    saveRegistry(injected);
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).projects.length, 0);

    // 用户手写的 self 条目：属于配置，保存时必须保留
    const userSelf = {
      id: 'custom-manager',
      name: 'Custom Manager',
      path: tmpDir(),
      enabled: true,
      self: true,
      kind: 'observe-only',
      start: { command: null, args: [] },
      stop: { strategy: 'none' },
      url: null,
      port: null,
      startupTimeoutMs: 0,
      update: { strategy: 'none' },
    };
    fs.writeFileSync(registryFile, JSON.stringify({ version: 1, projects: [userSelf] }), 'utf8');

    const loaded = loadRegistry();
    assert.equal(loaded.projects.length, 1, '已有 self 时不应再注入合成条目');
    saveRegistry(loaded);

    const saved = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(saved.projects.length, 1);
    assert.equal(saved.projects[0].id, 'custom-manager');
  } finally {
    if (previous === undefined) delete process.env.GPI_REGISTRY_FILE;
    else process.env.GPI_REGISTRY_FILE = previous;
  }
});
