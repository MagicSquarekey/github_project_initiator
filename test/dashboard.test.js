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
    addEventListener() {},
    removeEventListener() {},
  };
  return el;
}

/**
 * 提取看板 <script> 并准备可调用环境。
 *
 * @returns {{ render: Function, errors: Map, busy: Set, grid: any }}
 */
function loadDashboard() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  const grid = mkEl('div');
  const els = {};
  const document_ = {
    getElementById: (id) => (els[id] ??= mkEl('div')),
  };

  const sandbox = {
    document: document_,
    CSS: { escape: (s) => String(s).replace(/"/g, '\\"') },
    fetch: async () => ({ json: async () => ({ projects: [] }) }),
    setInterval: () => {},
    clearTimeout: () => {},
    setTimeout: () => 0,
    confirm: () => false,
    console,
  };

  // 把 grid 挂到 getElementById('grid')
  els.grid = grid;

  // 用 Function 构造而非 eval，避免内联转义问题
  const body = code.replace(/refresh\(\);\s*setInterval\(refresh, 3000\);/, '');
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, `${body}\nreturn { render, errors, busy, snapshot };`);
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
    lastError: null, ports: [], url: null, startable: true, updatable: true,
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

test('不可更新项目显示手动更新', () => {
  const { render, grid } = loadDashboard();
  render([proj({ id: 'a', name: 'A', updatable: false })]);
  assert.match(grid.children.join(''), /手动更新/);
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
  assert.match(grid.children.join(''), /1h2m/);
});
