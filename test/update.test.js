/**
 * 非 git 一键更新测试。
 *
 * 覆盖：zip 解压、preserve 匹配、overlay 备份/回滚、二进制替换/回滚、
 * command 策略、release overlay 全流程（fetch 用桩，不访问网络）。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractZip } from '../src/core/zip.js';
import { isPreserved, globMatch, applyOverlay, restoreBackup, replaceBinary } from '../src/core/release.js';
import { updateProject } from '../src/core/update.js';
import { detectVersion, clearVersionCache } from '../src/core/version.js';

/** top/hello.txt + top/sub/world.txt 的 deflate zip */
const ZIP_B64 =
  'UEsDBBQAAAAIAAN3VF2GphA2BwAAAAUAAAANAAAAdG9wL2hlbGxvLnR4dMtIzcnJBwBQSwMEFAAAAAgAA3dUXUMRdzoHAAAABQAAABEAAAB0b3Avc3ViL3dvcmxkLnR4dCvPL8pJAQBQSwECFAAUAAAACAADd1RdhqYQNgcAAAAFAAAADQAAAAAAAAAAAAAAgAEAAAAAdG9wL2hlbGxvLnR4dFBLAQIUABQAAAAIAAN3VF1DEXc6BwAAAAUAAAARAAAAAAAAAAAAAACAATIAAAB0b3Avc3ViL3dvcmxkLnR4dFBLBQYAAAAAAgACAHoAAABoAAAAAAA=';

/**
 * @param {import('node:test').TestContext} t
 * @param {string} [prefix]
 * @returns {string}
 */
function tmp(t, prefix = 'gpi-upd-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('extractZip 解出嵌套文件', (t) => {
  const root = tmp(t);
  const zip = path.join(root, 'fixture.zip');
  fs.writeFileSync(zip, Buffer.from(ZIP_B64, 'base64'));

  const out = path.join(root, 'out');
  extractZip(zip, out);

  assert.equal(fs.readFileSync(path.join(out, 'top', 'hello.txt'), 'utf8'), 'hello');
  assert.equal(fs.readFileSync(path.join(out, 'top', 'sub', 'world.txt'), 'utf8'), 'world');
});

test('glob 与 preserve 匹配', () => {
  assert.equal(globMatch('*-windows-amd64.zip', 'demo-windows-amd64.zip'), true);
  assert.equal(globMatch('*-windows-amd64.zip', 'demo-linux-amd64.tar.gz'), false);
  assert.equal(isPreserved('accounts/settings.json', ['accounts/**']), true);
  assert.equal(isPreserved('accounts', ['accounts/**']), true);
  assert.equal(isPreserved('qoder_proxy.py', ['accounts/**']), false);
});

test('applyOverlay 保留 accounts，并可完整回滚', (t) => {
  const root = tmp(t);
  const dest = path.join(root, 'dest');
  const src = path.join(root, 'src');
  const backup = path.join(root, 'backup');
  fs.mkdirSync(path.join(dest, 'accounts'), { recursive: true });
  fs.mkdirSync(path.join(src, 'accounts'), { recursive: true });
  fs.mkdirSync(backup, { recursive: true });

  fs.writeFileSync(path.join(dest, 'accounts', 'settings.json'), 'local');
  fs.writeFileSync(path.join(dest, 'hello.txt'), 'old');
  fs.writeFileSync(path.join(src, 'accounts', 'settings.json'), 'remote');
  fs.writeFileSync(path.join(src, 'hello.txt'), 'new');
  fs.writeFileSync(path.join(src, 'new.txt'), 'created');

  applyOverlay(src, dest, ['accounts/**'], backup);

  assert.equal(fs.readFileSync(path.join(dest, 'accounts', 'settings.json'), 'utf8'), 'local');
  assert.equal(fs.readFileSync(path.join(dest, 'hello.txt'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(path.join(dest, 'new.txt'), 'utf8'), 'created');

  restoreBackup(dest, backup);

  assert.equal(fs.readFileSync(path.join(dest, 'hello.txt'), 'utf8'), 'old');
  assert.equal(fs.existsSync(path.join(dest, 'new.txt')), false);
  assert.equal(fs.readFileSync(path.join(dest, 'accounts', 'settings.json'), 'utf8'), 'local');
});

test('replaceBinary 备份旧文件并可回滚', (t) => {
  const root = tmp(t);
  const dest = path.join(root, 'app.exe');
  const src = path.join(root, 'new.exe');
  const backup = path.join(root, 'backup');
  fs.writeFileSync(dest, 'old');
  fs.writeFileSync(src, 'new');
  fs.mkdirSync(backup, { recursive: true });

  replaceBinary(src, dest, backup, 'app.exe');
  assert.equal(fs.readFileSync(dest, 'utf8'), 'new');

  restoreBackup(root, backup);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'old');
});

test('command 策略执行升级命令', async (t) => {
  const dir = tmp(t);
  const r = await updateProject({
    id: 'cmd-test',
    name: 'Cmd',
    path: dir,
    kind: 'cli-tool',
    start: { command: null, args: [] },
    stop: { strategy: 'none' },
    update: {
      strategy: 'command',
      command: process.execPath,
      args: ['-e', 'require("fs").writeFileSync("updated.txt","yes")'],
      timeoutMs: 10000,
      stopBefore: false,
      startAfter: false,
    },
  });

  assert.equal(r.ok, true, r.message);
  assert.equal(fs.readFileSync(path.join(dir, 'updated.txt'), 'utf8'), 'yes');
});

test('release overlay 下载、覆盖、保留并记录版本', async (t) => {
  const dir = tmp(t);
  const stateFile = path.join(tmp(t), 'versions.json');
  const backupBase = tmp(t);
  process.env.GPI_VERSIONS_FILE = stateFile;
  process.env.GPI_BACKUP_DIR = backupBase;

  const originalFetch = globalThis.fetch;
  const zipBuf = Buffer.from(ZIP_B64, 'base64');
  const release = {
    tag_name: 'v1.2.4',
    assets: [{ name: 'demo-windows-amd64.zip', browser_download_url: 'https://example.test/demo.zip' }],
    zipball_url: 'https://example.test/source.zip',
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.github.com')) {
      return new Response(JSON.stringify(release), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url).includes('demo.zip')) return new Response(zipBuf, { status: 200 });
    return new Response('not found', { status: 404 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GPI_VERSIONS_FILE;
    delete process.env.GPI_BACKUP_DIR;
  });

  fs.writeFileSync(path.join(dir, 'hello.txt'), 'old');
  fs.mkdirSync(path.join(dir, 'accounts'));
  fs.writeFileSync(path.join(dir, 'accounts', 'settings.json'), 'local');

  const project = {
    id: 'rel-test',
    name: 'Rel',
    path: dir,
    kind: 'cli-tool',
    start: { command: null, args: [] },
    stop: { strategy: 'none' },
    update: {
      strategy: 'release',
      repo: 'test/demo',
      mode: 'overlay',
      asset: 'demo-*.zip',
      stripComponents: 1,
      preserve: ['accounts/**'],
      stopBefore: false,
      startAfter: false,
    },
  };

  const r = await updateProject(project);
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /v1\.2\.4/);
  assert.equal(fs.readFileSync(path.join(dir, 'hello.txt'), 'utf8'), 'hello');
  assert.equal(fs.readFileSync(path.join(dir, 'sub', 'world.txt'), 'utf8'), 'world');
  assert.equal(fs.readFileSync(path.join(dir, 'accounts', 'settings.json'), 'utf8'), 'local');

  clearVersionCache();
  assert.equal(await detectVersion(project), '1.2.4');
});
