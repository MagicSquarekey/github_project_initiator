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
    const block = text.match(/<details>([\s\S]*?)<\/details>/)?.[1] ?? '';
    assert.ok(block, `${code} 缺少语言切换器`);

    // 30 种语言中，除当前语言外都应是链接
    const linkCount = (block.match(/\]\(/g) ?? []).length;
    assert.equal(linkCount, LANGS.length - 1, `${code} 的切换器链接数不对`);

    // 当前语言加粗且不带链接
    assert.ok(block.includes(`**${tName(code)}**`), `${code} 未高亮当前语言`);
  }
});

/**
 * 取某语言的本地名称（从翻译源读取，避免测试里再维护一份）。
 *
 * @param {string} code
 * @returns {string}
 */
function tName(code) {
  return loadTranslations()[code].name;
}

test('根目录只保留一个 README.md，语言文件收在 docs/i18n', () => {
  const rootReadmes = fs
    .readdirSync(ROOT)
    .filter((f) => /^README\..+\.md$/.test(f));
  assert.deepEqual(rootReadmes, [], `根目录不应再有平铺的语言文件：${rootReadmes.join(', ')}`);

  const nested = fs.readdirSync(path.join(ROOT, 'docs', 'i18n')).filter((f) => /^README\..+\.md$/.test(f));
  assert.equal(nested.length, LANGS.length - 1, 'docs/i18n 下的语言文件数量不对');
});

test('所有相对链接都能解析到真实文件', () => {
  for (const [, file] of LANGS) {
    const abs = path.join(ROOT, file);
    const text = fs.readFileSync(abs, 'utf8');
    const dir = path.dirname(abs);
    for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
      const href = m[1];
      if (/^https?:/.test(href) || href.startsWith('#')) continue;
      assert.ok(fs.existsSync(path.resolve(dir, href)), `${file} 断链 → ${href}`);
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
    // 7 个功能 + 3 条安全 + 3 个文档链接
    assert.equal(bullets.length, 13, `${code} 的列表项数量不对`);
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
    assert.equal(t[code].features.length, 7, `${code}.features 应有 7 条`);
    assert.equal(t[code].security.length, 3, `${code}.security 应有 3 条`);
    assert.equal(t[code].cols.length, 4, `${code}.cols 应有 4 列`);
    assert.equal(t[code].upd.length, 3, `${code}.upd 应有 3 种更新方式`);
  }
});
