/**
 * 看板渲染逻辑测试。
 *
 * 为什么这样测：本机没有 Playwright，无法起真实浏览器。
 * 但看板的核心风险全在前端渲染逻辑（增量更新、状态映射、XSS 转义），
 * 这些都能用一个最小 DOM 模拟 + eval 提取出的 <script> 代码来覆盖。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, '..', 'public', 'index.html');

/** 最小 DOM 元素，只实现看板用到的接口 */
function mkEl(tag) {
  const el = {
    tag,
    children: [],
    dataset: {},
    style: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { this._s.has(c); },
      toggle(c) { if (this._s.has(c)) this._s.delete(c); else this._s.add(c); },
    },
    textContent: '',
    scrollTop: 0,
    scrollHeight: 0,
    _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    insertAdjacentHTML(_pos, h) { this.children.push(h); },
    querySelector() { return null; },
    remove() {},
    closest() { return null; },
    // 看板在 grid 与按钮上注册了事件委托，测试环境收起来即可
    // 但要能被 .click() 触发，否则按钮行为无法验证
    _handlers: {},
    addEventListener(type, handler) { this._handlers[type] = handler; },
    click() { this._handlers.click?.(); },
    removeEventListener() {},
  };
  return el;
}

/**
 * 提取看板 <script> 并准备可调用环境。
 *
 * 最小 DOM 桩只需覆盖看板用到的接口；localStorage 也要桩掉
 * ——看板用它记住语言与主题偏好。
 *
 * @returns {{ render: Function, errors: Map, busy: Set, snapshot: Map, grid: any, applyLang: Function, applyTheme: Function }}
 */
function loadDashboard() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  const grid = mkEl('div');
  const els = { grid };

  const store = new Map();
  const sandbox = {
    document: {
      getElementById: (id) => (els[id] ??= mkEl('div')),
      querySelectorAll: () => [],
      documentElement: { dataset: {}, lang: '' },
      addEventListener: () => {},
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: { language: 'zh-CN' },
    CSS: { escape: (s) => String(s).replace(/"/g, '\\"') },
    fetch: async () => ({ json: async () => ({ projects: [] }) }),
    setInterval: () => {},
    clearTimeout: () => {},
    setTimeout: () => 0,
    confirm: () => false,
    console,
  };

  // 用 Function 构造而非 eval，避免内联转义问题
  const body = code.replace(/refresh\(\);\s*setInterval\(refresh, 3000\);/, '');
  const keys = Object.keys(sandbox);
  const fn = new Function(
    ...keys,
    `${body}\nreturn { render, errors, busy, snapshot, applyLang, applyTheme, I18N, t,
      field, buildAddPayload, validateAddPayload, applyDetection, syncAddForm, resetAddForm };`,
  );
  return { ...fn(...keys.map((k) => sandbox[k])), grid };
}
const baseGit = {
  isRepo: true, branch: 'main', dirty: false, behind: 0, ahead: 0,
  remotes: ['origin'], head: null,
};

function proj(over) {
  return {
    id: 'x', name: 'X', kind: 'node-service', path: '', enabled: true,
    running: false, runningVia: null, openPorts: [], pids: [], phase: 'idle',
    lastError: null, version: null, ports: [], url: null, startable: true, updatable: true,
    uptimeSec: null, git: { ...baseGit }, ...over,
  };
}

test('渲染所有项目卡片', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A' }), proj({ id: 'b', name: 'B' })]);
  assert.equal(grid.children.length, 2);
});

test('运行中项目带 running 类与停止按钮', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', running: true, ports: [8090], url: 'http://127.0.0.1:8090' })]);
  const h = grid.children.join('');
  assert.match(h, /class="card running"/);
  assert.match(h, /data-act="stop" data-id="a"/);
  assert.match(h, /data-act="restart" data-id="a"/);
});

test('未运行项目带启动按钮', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', running: false, startable: true })]);
  assert.match(grid.children.join(''), /data-act="start" data-id="a"/);
});

test('不可启动项目不渲染启动按钮', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', running: false, startable: false, kind: 'observe-only' })]);
  assert.doesNotMatch(grid.children.join(''), /data-act="start"/);
});

test('observe-only 项目运行中也只保留日志/移除，不显示无效的启停/更新', () => {
  const { render, grid } = loadDashboard();
  render([proj({
    id: 'pg', name: 'PostgreSQL', kind: 'observe-only',
    running: true, startable: false, updatable: false,
  })]);
  const h = grid.children.join('');
  assert.doesNotMatch(h, /data-act="stop"/);
  assert.doesNotMatch(h, /data-act="restart"/);
  assert.doesNotMatch(h, /data-act="start"/);
  assert.doesNotMatch(h, /data-act="update"/);
  assert.match(h, /data-act="logs" data-id="pg"/);
  assert.match(h, /data-act="remove" data-id="pg"/);
});

test('自身项目只保留日志按钮，不渲染启停/重启/更新', () => {
  const { render, grid } = loadDashboard();
  render([proj({
    id: 'manager', name: 'github_project_initiator', self: true,
    running: true, kind: 'observe-only', updatable: false,
  })]);
  const h = grid.children.join('');
  assert.doesNotMatch(h, /data-act="stop"/);
  assert.doesNotMatch(h, /data-act="restart"/);
  assert.doesNotMatch(h, /data-act="start"/);
  assert.doesNotMatch(h, /data-act="update"/);
  assert.match(h, /data-act="logs" data-id="manager"/);
  // 卡片右上角标出"自身"，避免和普通 observe-only 项目混淆
  assert.match(h, /class="kind self"/);
  assert.match(h, /自身/);
});

test('不可更新项目显示手动更新', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', updatable: false })]);
  assert.match(grid.children.join(''), /手动更新/);
});

test('非 git 项目配置 command/release 后显示更新按钮', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', updatable: true, git: { ...baseGit, isRepo: false } })]);
  const h = grid.children.join('');
  assert.match(h, /data-act="update" data-id="a"/);
  assert.doesNotMatch(h, /手动更新/);
});

test('落后提交数显示 ↓N，更新按钮带计数', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', updatable: true, git: { ...baseGit, behind: 14 } })]);
  const h = grid.children.join('');
  assert.match(h, /↓14/);
  assert.match(h, /更新 ↓14/);
});

test('脏工作区与本地领先有对应提示', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', git: { ...baseGit, dirty: true, ahead: 2 } })]);
  const h = grid.children.join('');
  assert.match(h, /有改动/);
  assert.match(h, /↑2/);
});

test('非 git 仓库显示非 git', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', git: { ...baseGit, isRepo: false } })]);
  assert.match(grid.children.join(''), /非 git/);
});

test('错误信息透出到卡片', () => {
  const { render, grid, errors } = loadDashboard();
  errors.set('a', '端口被占用');
  render([proj({ id: 'a', name: 'A' })]);
  assert.match(grid.children.join(''), /端口被占用/);
});

test('增量渲染：数据不变不重建 DOM', () => {
  const { render, grid } = loadDashboard();
  const list = [proj({ id: 'a', name: 'A', running: true })];
  render(list);
  const first = grid.children.length;
  render(list);
  assert.equal(grid.children.length, first, '重复 render 不应追加新节点');
});

test('增量渲染：数据变化则更新', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', running: false })]);
  assert.doesNotMatch(grid.children.join(''), /card running/);
  render([proj({ id: 'a', name: 'A', running: true })]);
  assert.match(grid.children.join(''), /card running/);
});

test('XSS：项目名中的 HTML 被转义', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: '<img src=x onerror=alert(1)>' })]);
  const h = grid.children.join('');
  assert.doesNotMatch(h, /<img src=x onerror=alert\(1\)>/);
  assert.match(h, /&lt;img/);
});

test('卡片显示版本号，纯数字版本补 v 前缀', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', version: '2.19.5' })]);
  assert.match(grid.children.join(''), /v2\.19\.5/);
});

test('已有 v 前缀的版本原样显示', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', version: 'V0.0.1' })]);
  assert.match(grid.children.join(''), /V0\.0\.1/);
});

test('无 tag 的短 SHA 显示为 @sha', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', version: 'df50a82' })]);
  assert.match(grid.children.join(''), /@df50a82/);
});

test('版本未知时显示提示', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', version: null })]);
  assert.match(grid.children.join(''), /版本未知/);
});

test('XSS：错误信息中的 HTML 被转义', () => {
  const { render, grid, errors } = loadDashboard();
  errors.set('a', '<script>alert(1)</script>');
  render([proj({ id: 'a', name: 'A' })]);
  assert.doesNotMatch(grid.children.join(''), /<script>alert/);
});

test('XSS：URL 中的注入被转义', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', running: true, url: 'http://x/"><script>alert(1)</script>' })]);
  assert.doesNotMatch(grid.children.join(''), /<script>alert/);
});

test('三个项目渲染三张卡片', () => {
  const { render, grid } = loadDashboard();
  render([
    proj({ id: 'a', name: 'A', running: true }),
    proj({ id: 'b', name: 'B', running: true }),
    proj({ id: 'c', name: 'C', running: false }),
  ]);
  assert.equal(grid.children.length, 3);
  assert.equal(grid.children.filter((h) => /card running/.test(h)).length, 2);
});

test('启动中状态显示处理中', () => {
  const { render, grid, busy } = loadDashboard();
  busy.add('a');
  render([proj({ id: 'a', name: 'A' })]);
  assert.match(grid.children.join(''), /处理中/);
});

test('运行时长格式化', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', running: true, uptimeSec: 3725 })]);
  assert.match(grid.children.join(''), /1h 2m/);
});

test('品牌名随语言切换（github项目启动器 / github_project_initiator）', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  const grid = mkEl('div');
  const brand = mkEl('div');
  brand.textContent = 'github项目启动器';
  const btnLang = mkEl('div');
  const els = { grid, 'brand-name': brand, 'btn-lang': btnLang };
  const store = new Map();

  const doc = {
    getElementById: (id) => (els[id] ??= mkEl('div')),
    querySelectorAll: () => [],
    documentElement: { dataset: {}, lang: '' },
    addEventListener: () => {},
    title: '',
  };

  const sandbox = {
    document: doc,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: { language: 'zh-CN' },
    CSS: { escape: (s) => String(s).replace(/"/g, '\\"') },
    fetch: async () => ({ json: async () => ({ projects: [] }) }),
    setInterval: () => {},
    clearTimeout: () => {},
    setTimeout: () => 0,
    confirm: () => false,
    console,
  };

  const body = code.replace(/refresh\(\);\s*setInterval\(refresh, 3000\);/, '');
  const fn = new Function(...Object.keys(sandbox), body);
  fn(...Object.keys(sandbox).map((k) => sandbox[k]));

  // 初始（系统语言 zh-CN）→ 中文
  assert.equal(brand.textContent, 'github项目启动器');
  assert.match(doc.title, /github项目启动器/);

  // 点击切英文
  btnLang.click();
  assert.equal(brand.textContent, 'github_project_initiator', '英文品牌名');
  assert.match(doc.title, /github_project_initiator · Project Manager/);

  // 再点回中文
  btnLang.click();
  assert.equal(brand.textContent, 'github项目启动器');
});

test('品牌图标存在', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /class="brand-icon"/);
  assert.match(html, /id="brand-name"/);
  // 内联 SVG，不依赖外部图标库
  assert.match(html, /<svg class="brand-icon"[^>]*>.*<\/svg>/s);
});

test('多服务项目逐个显示子服务与就绪状态', () => {
  const { render, grid } = loadDashboard();
  render([proj({
    id: 'ath', name: 'AutoTestHub', running: true, runningVia: 'port', openPorts: [8686, 5173],
    url: 'http://127.0.0.1:5173',
    services: [
      { label: 'backend', port: 8686, url: 'http://127.0.0.1:8686' },
      { label: 'frontend', port: 5173, url: 'http://127.0.0.1:5173' },
    ],
  })]);
  const h = grid.children.join('');
  assert.match(h, /backend:8686/);
  assert.match(h, /frontend:5173/);
  // 两个端口都在跑 → 状态行 1 个 + 子服务 2 个 = 3 个就绪点
  assert.equal((h.match(/led on/g) || []).length, 3, '两个子服务都应显示为就绪');
});

test('多服务项目部分端口未起时只点亮已起的', () => {
  const { render, grid } = loadDashboard();
  render([proj({
    id: 'ath', name: 'AutoTestHub', running: true, runningVia: 'port', openPorts: [5173],
    services: [
      { label: 'backend', port: 8686, url: 'http://127.0.0.1:8686' },
      { label: 'frontend', port: 5173, url: 'http://127.0.0.1:5173' },
    ],
  })]);
  const h = grid.children.join('');
  // 状态行亮（项目在跑）+ frontend 亮 = 2；backend 未起 = 1 个 off
  assert.equal((h.match(/led on/g) || []).length, 2, '只有 5173 就绪');
  assert.equal((h.match(/led off/g) || []).length, 1, '8686 应显示未就绪');
});

test('i18n：中英文案都存在且键对齐', () => {
  const { I18N } = loadDashboard();
  assert.ok(I18N.zh && I18N.en);
  // 两种语言的键必须一致，否则切语言会露出未翻译的 key
  const zhKeys = Object.keys(I18N.zh).sort();
  const enKeys = Object.keys(I18N.en).sort();
  assert.deepEqual(enKeys, zhKeys, '中英文案键集合不一致');
});

test('i18n：按钮文案随语言切换', () => {
  const { render, grid, applyLang } = loadDashboard();
  render([proj({ id: 'a', name: 'A', running: true })]);
  assert.match(grid.children.join(''), />停止</);   // 默认中文

  // 看板内部 lang 是模块级变量，applyLang 读取它；这里直接验证两套案不同
  const { I18N } = loadDashboard();
  assert.notEqual(I18N.zh.stop, I18N.en.stop);
  assert.notEqual(I18N.zh.updateAll, I18N.en.updateAll);
});

test('i18n：t() 支持插值函数', () => {
  const { t } = loadDashboard();
  // updateDone 是函数式文案
  assert.match(t('updateDone', 2, 3, 'X'), /2/);
  assert.match(t('updateDone', 2, 3, 'X'), /3/);
});

test('主题：明暗两套 CSS 变量都定义了', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const darkStart = html.indexOf('data-theme="dark"');
  const lightStart = html.indexOf('data-theme="light"');
  assert.ok(darkStart >= 0 && lightStart > darkStart);

  // 两个主题块（dark 块到 light 块开头，light 块到 * 选择器前）
  const darkBlock = html.slice(darkStart, lightStart);
  const lightBlock = html.slice(lightStart, html.indexOf('* {', lightStart));

  for (const name of ['bg', 'card', 'text', 'border', 'accent', 'green', 'red']) {
    assert.match(darkBlock, new RegExp(`--${name}:`), `dark 主题缺少 --${name}`);
    assert.match(lightBlock, new RegExp(`--${name}:`), `light 主题缺少 --${name}`);
  }
});

test('样式：卡片网格用固定列宽保证统一', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  // 必须用固定 3 列，不能用 auto-fill（那会导致卡片宽度不一）
  assert.match(html, /grid-template-columns:\s*repeat\(3/);
  assert.doesNotMatch(html, /auto-fill/);
});

test('样式：卡片有最小高度，空内容也等高', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /\.card\s*{[^}]*min-height/);
});

test('语言与主题切换按钮存在', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /id="btn-lang"/);
  assert.match(html, /id="btn-theme"/);
  assert.match(html, /id="lang-label"/);
  assert.match(html, /id="theme-label"/);
});

test('日志抽屉存在且可关闭', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /id="drawer"/);
  assert.match(html, /id="drawer-close"/);
});

/* ---------------- 添加项目 ---------------- */

test('添加项目入口与弹窗存在', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /id="btn-add"/);
  assert.match(html, /id="add-modal"/);
  assert.match(html, /id="add-path"/);
  assert.match(html, /id="btn-browse"/);
  assert.match(html, /id="btn-scan"/);
  assert.match(html, /id="add-submit"/);
  assert.match(html, /id="browse-modal"/);
  assert.match(html, /id="browse-list"/);
});

test('普通项目有移除按钮，管理器自身没有', () => {
  const normal = loadDashboard();
  normal.render([proj({ id: 'a', name: 'A' })]);
  assert.match(normal.grid.children.join(''), /data-act="remove" data-id="a"/);

  const self = loadDashboard();
  self.render([proj({ id: 'manager', name: 'M', self: true, kind: 'observe-only' })]);
  assert.doesNotMatch(self.grid.children.join(''), /data-act="remove"/);
});

test('添加表单：识别结果只填空字段，force 时覆盖', () => {
  const { applyDetection, field } = loadDashboard();

  field('add-name').value = '手填名称';
  applyDetection({
    exists: true,
    name: '识别名称',
    kind: 'node-service',
    start: { command: 'cmd.exe', args: ['/c', 'x.bat'] },
    ports: [4000],
    update: 'none',
  }, false);

  assert.equal(field('add-name').value, '手填名称', '已有输入不应被覆盖');
  assert.equal(field('add-start-command').value, 'cmd.exe');
  assert.equal(field('add-start-args').value, '/c x.bat');
  assert.equal(field('add-port').value, '4000');
  assert.equal(field('add-url').value, 'http://127.0.0.1:4000');

  applyDetection({
    exists: true,
    name: '覆盖名称',
    start: { command: 'npm', args: ['start'] },
    ports: [5000],
    update: 'git',
  }, true);

  assert.equal(field('add-name').value, '覆盖名称');
  assert.equal(field('add-start-command').value, 'npm');
  assert.equal(field('add-port').value, '5000');
  assert.equal(field('add-update-strategy').value, 'git');

  // 类型/更新方式是强信号：即使表单已有默认值也要采用识别结果
  applyDetection({
    exists: true,
    kind: 'python-service',
    update: 'none',
    ports: [6000],
  }, false);
  assert.equal(field('add-kind').value, 'python-service');
  assert.equal(field('add-update-strategy').value, 'none');

  // 无端口但有 exe：默认按进程名停止并填好进程名
  applyDetection({
    exists: true,
    kind: 'desktop-app',
    exeFiles: ['game.exe'],
    ports: [],
    update: 'none',
  }, false);
  assert.equal(field('add-stop-strategy').value, 'procname');
  assert.equal(field('add-stop-image').value, 'game.exe');
});

test('添加表单：payload 组装与前端校验', () => {
  const { field, buildAddPayload, validateAddPayload } = loadDashboard();

  field('add-name').value = 'Demo';
  field('add-path').value = 'C:/tmp/demo';
  field('add-kind').value = 'node-service';
  field('add-start-command').value = 'cmd.exe';
  field('add-start-args').value = '/c start.bat';
  field('add-port').value = '45678';
  field('add-stop-strategy').value = 'port';
  field('add-update-strategy').value = 'none';

  const payload = buildAddPayload();
  assert.equal(payload.name, 'Demo');
  assert.equal(payload.path, 'C:/tmp/demo');
  assert.equal(payload.startArgs, '/c start.bat');
  assert.equal(payload.port, '45678');
  assert.deepEqual(validateAddPayload(payload), []);

  // 服务类项目缺启动命令 → 前端先拦
  field('add-start-command').value = '';
  assert.match(validateAddPayload(buildAddPayload()).join(), /启动命令/);

  // 仅监测类型允许没有启动命令
  field('add-kind').value = 'observe-only';
  assert.deepEqual(validateAddPayload(buildAddPayload()), []);
});

test('添加表单：多端口输入保留原样，由后端解析', () => {
  const { field, buildAddPayload } = loadDashboard();
  field('add-name').value = 'Multi';
  field('add-path').value = 'C:/tmp/multi';
  field('add-start-command').value = 'cmd.exe';
  field('add-port').value = '8686, 5173';

  assert.equal(buildAddPayload().port, '8686, 5173');
});
