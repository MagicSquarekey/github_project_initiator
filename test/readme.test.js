/**
 * 多语言 README 一致性测试。
 *
 * 锁住三件事：
 *   1. 30 种语言的 README 都存在；
 *   2. 结构逐行一致（同样的表格行数、同样的列表项数）；
 *   3. 仓库里的文件与翻译源同步——改了 JSON 忘记重新生成会直接失败。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, loadTranslations, render } from '../scripts/gen-readmes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('30 种语言的 README 都存在', () => {
  assert.equal(LANGS.length, 30);
  for (const [code, file] of LANGS) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `缺少 ${code} → ${file}`);
  }
});

test('每份 README 都包含完整语言切换器', () => {
  for (const [code, file] of LANGS) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const [, otherFile] of LANGS) {
      if (otherFile === file) continue;
      assert.ok(text.includes(`](${otherFile})`), `${code} 缺少指向 ${otherFile} 的链接`);
    }
  }
});

test('结构逐行一致：项目表 9 行、列表项 12 条', () => {
  for (const [code, file] of LANGS) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const tableRows = text.split(/\r?\n/).filter((l) => l.startsWith('| '));
    // 表头 1 行 + 项目 9 行（分隔行以 |--- 开头，不计入）
    assert.equal(tableRows.length, 10, `${code} 的表格行数不对`);
    const bullets = text.split(/\r?\n/).filter((l) => l.startsWith('- '));
    // 6 个功能 + 3 条安全 + 3 个文档链接
    assert.equal(bullets.length, 12, `${code} 的列表项数量不对`);
  }
});

test('仓库中的 README 与翻译源同步（防止忘记重新生成）', () => {
  const t = loadTranslations();
  for (const [code, file] of LANGS) {
    const actual = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const expected = render(code, t);
    assert.equal(actual, expected, `${file} 与 docs/i18n 不一致，请运行 npm run readme`);
  }
});

test('所有语言都不含本机绝对路径', () => {
  for (const [code, file] of LANGS) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<]+/, `${code} 含本机路径`);
    assert.doesNotMatch(text, /\/(?:home|Users)\/[^\/\s"'<]+/, `${code} 含 POSIX 用户路径`);
  }
});

test('翻译源覆盖全部语言且字段完整', () => {
  const t = loadTranslations();
  const required = [
    'name', 'tagline', 'intro', 'features', 'quickstart', 'openLabel',
    'req', 'projects', 'cols', 'upd', 'security', 'docs',
    'designLabel', 'fullLabel', 'testsLabel',
  ];
  for (const [code] of LANGS) {
    assert.ok(t[code], `缺少翻译：${code}`);
    for (const key of required) {
      assert.ok(t[code][key] !== undefined, `${code}.${key} 缺失`);
    }
    assert.equal(t[code].features.length, 6, `${code}.features 应有 6 条`);
    assert.equal(t[code].security.length, 3, `${code}.security 应有 3 条`);
    assert.equal(t[code].cols.length, 4, `${code}.cols 应有 4 列`);
    assert.equal(t[code].upd.length, 3, `${code}.upd 应有 3 种更新方式`);
  }
});
