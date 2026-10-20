/**
 * 目录识别：给一个项目目录，推断它该怎么启动、监听哪个端口、能不能 git 更新。
 *
 * 这是"添加项目"体验的核心：开源用户通常不知道自己项目的启动脚本叫什么、
 * 端口写在哪个文件里。识别结果只作为表单的预填建议，最终仍由用户确认，
 * 所以这里宁可少猜（返回 null）也不要瞎猜。
 */

import fs from 'node:fs';
import path from 'node:path';
import { expandPath, loadRegistry } from '../core/registry.js';

/** 项目特征文件 → 建议 kind / 展示名 */
export const MARKERS = [
  { file: 'package.json', kind: 'node-service', label: 'Node 项目' },
  { file: 'pyproject.toml', kind: 'python-service', label: 'Python 项目' },
  { file: 'requirements.txt', kind: 'python-service', label: 'Python 项目' },
  { file: 'setup.py', kind: 'python-service', label: 'Python 项目' },
  { file: 'manage.py', kind: 'python-service', label: 'Django 项目' },
  { file: 'project.godot', kind: 'desktop-app', label: 'Godot 工程' },
  { file: 'pom.xml', kind: 'java-service', label: 'Maven 项目' },
  { file: 'build.gradle', kind: 'java-service', label: 'Gradle 项目' },
  { file: 'go.mod', kind: 'go-binary', label: 'Go 项目' },
  { file: 'Cargo.toml', kind: 'cli-tool', label: 'Rust 项目' },
];

/** 常见启动脚本，按优先级排列 */
const START_SCRIPTS = [
  'start.bat',
  'start.cmd',
  'start.vbs',
  'start.ps1',
  'run.bat',
  'run.cmd',
  'run.ps1',
  'dev.bat',
  'dev.cmd',
  'start.sh',
  'run.sh',
];

/**
 * 生成一条启动建议。
 *
 * @param {string} file
 * @param {'script'|'package.json'|'exe'|'jar'|'python'} source
 * @returns {{ label: string, command: string, args: string[], source: string }}
 */
function startSuggestion(file, source) {
  const lower = file.toLowerCase();
  const win = process.platform === 'win32';

  if (source === 'script') {
    if (lower.endsWith('.ps1')) {
      return {
        label: `运行 ${file}`,
        command: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file],
        source,
      };
    }
    if (win) {
      return { label: `运行 ${file}`, command: 'cmd.exe', args: ['/c', file], source };
    }
    return {
      label: `运行 ${file}`,
      command: lower.endsWith('.sh') ? 'bash' : 'sh',
      args: [file],
      source,
    };
  }

  if (source === 'exe') {
    return { label: `直接运行 ${file}`, command: file, args: [], source };
  }

  if (source === 'jar') {
    return { label: `java -jar ${file}`, command: 'java', args: ['-jar', file], source };
  }

  return { label: `python ${file}`, command: 'python', args: [file], source };
}

/**
 * 从常见配置文件里猜端口。
 *
 * @param {string} dir
 * @param {Set<string>} files 小写文件名集合
 * @param {any} pkg 已解析的 package.json（可能为 null）
 * @param {string[]} scriptFiles 检测到的启动脚本文件名
 * @returns {number|null}
 */
function guessPort(dir, files, pkg, scriptFiles = []) {
  const read = (name, maxBytes = 128 * 1024) => {
    try {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > maxBytes) return null;
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  };
  const toPort = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
  };

  // .env 系列：PORT=8080 / APP_PORT=...
  for (const name of ['.env', '.env.local', '.env.development', '.env.example']) {
    if (!files.has(name)) continue;
    const text = read(name);
    const m = text?.match(/^\s*(?:PORT|APP_PORT|SERVER_PORT)\s*=\s*["']?(\d{2,5})/im);
    if (m && toPort(m[1])) return toPort(m[1]);
  }

  // Spring Boot：server.port=9200
  for (const name of ['application.properties', 'application.yml', 'application.yaml']) {
    if (!files.has(name)) continue;
    const text = read(name);
    const m = text?.match(/^\s*server\s*[.:]\s*\n?\s*port\s*[:=]\s*["']?(\d{2,5})/im);
    if (m && toPort(m[1])) return toPort(m[1]);
  }

  // config.json：listen: ":7863" / port: 7863
  if (files.has('config.json')) {
    const text = read('config.json');
    if (text) {
      try {
        const port = findPortDeep(JSON.parse(text));
        if (port) return port;
      } catch {
        // 配置文件不是合法 JSON，跳过
      }
    }
  }

  // 启动脚本里写死的端口：--port 8090 / -p 8090 / PORT=8090 / localhost:8090
  for (const name of scriptFiles) {
    const text = read(name);
    if (!text) continue;
    const patterns = [
      /(?:--port[=\s]+|-p[=\s]+)(\d{2,5})\b/i,
      /\bPORT\s*=\s*["']?(\d{2,5})/i,
      /(?:localhost|127\.0\.0\.1):(\d{2,5})\b/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && toPort(m[1])) return toPort(m[1]);
    }
  }

  // package.json scripts：--port 3000 / -p 3000
  if (pkg?.scripts && typeof pkg.scripts === 'object') {
    for (const script of Object.values(pkg.scripts)) {
      if (typeof script !== 'string') continue;
      const m = script.match(/(?:--port[=\s]+|-p[=\s]+)(\d{2,5})/);
      if (m && toPort(m[1])) return toPort(m[1]);
    }
  }

  // Vite / Next 配置：port: 5173
  for (const name of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'next.config.js', 'next.config.mjs']) {
    if (!files.has(name)) continue;
    const text = read(name);
    const m = text?.match(/\bport\s*:\s*(\d{2,5})/);
    if (m && toPort(m[1])) return toPort(m[1]);
  }

  return null;
}

/**
 * 在 JSON 对象里找第一个像端口的字段（port / listen）。
 *
 * @param {any} value
 * @param {number} [depth]
 * @returns {number|null}
 */
function findPortDeep(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 3) return null;
  for (const [key, raw] of Object.entries(value)) {
    const k = key.toLowerCase();
    if (k === 'port' || k === 'serverport' || k === 'listen') {
      const text = String(raw ?? '').trim();
      // listen 可能是 ":7863" 或 "127.0.0.1:7863"
      const m = text.match(/(\d{2,5})\s*$/);
      const n = Number(m?.[1] ?? text);
      if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
    }
    const nested = findPortDeep(raw, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * 识别单个目录。
 *
 * @param {string} dir
 * @param {{ registryProjects?: any[] }} [options]
 * @returns {any}
 */
export function inspectDirectory(dir, options = {}) {
  const raw = String(dir ?? '').trim();
  if (!raw) return { exists: false, error: '目录为空' };

  const abs = path.resolve(expandPath(raw));
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return { exists: false, path: abs, error: '目录不存在' };
  }
  if (!stat.isDirectory()) {
    return { exists: false, path: abs, error: '不是目录' };
  }

  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    return { exists: true, path: abs, error: `无法读取目录：${err.message}` };
  }

  const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);
  const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const files = new Map(fileNames.map((n) => [n.toLowerCase(), n]));
  const dirs = new Set(dirNames.map((n) => n.toLowerCase()));
  const hasGit = dirs.has('.git');

  // —— 特征文件 ——
  const markers = MARKERS.filter((m) => files.has(m.file.toLowerCase()));
  const marker = markers[0] ?? null;

  // —— package.json（脚本与端口线索） ——
  let pkg = null;
  if (files.has('package.json')) {
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(abs, files.get('package.json')), 'utf8'));
    } catch {
      // 损坏的 package.json 不影响其他识别
    }
  }

  // —— 启动建议，按可靠性排序：项目脚本 > npm scripts > 可执行文件 > python ——
  const startCandidates = [];
  const scriptFiles = fileNames.filter((n) => /\.(bat|cmd|vbs|ps1|sh)$/i.test(n));
  const exactScripts = START_SCRIPTS.map((name) => files.get(name.toLowerCase())).filter(Boolean);
  // 项目专属脚本：start-libretv.cmd、dev-server.bat 等
  const fuzzyScripts = scriptFiles
    .filter((n) => /^(start|run|dev)[-_.]/i.test(n) && !exactScripts.includes(n))
    .sort()
    .slice(0, 3);
  for (const actual of [...exactScripts, ...fuzzyScripts]) {
    startCandidates.push(startSuggestion(actual, 'script'));
  }

  if (pkg?.scripts && typeof pkg.scripts === 'object') {
    const win = process.platform === 'win32';
    for (const name of ['start', 'dev', 'serve']) {
      if (typeof pkg.scripts[name] !== 'string') continue;
      const args = name === 'start' ? ['start'] : ['run', name];
      startCandidates.push({
        label: name === 'start' ? 'npm start' : `npm run ${name}`,
        command: win ? 'cmd.exe' : 'npm',
        args: win ? ['/c', 'npm', ...args] : args,
        source: 'package.json',
      });
    }
    // 有 main 但没有任何 scripts 时，退化为 node <main>
    if (!startCandidates.length && typeof pkg.main === 'string' && pkg.main) {
      startCandidates.push({
        label: `node ${pkg.main}`,
        command: 'node',
        args: [pkg.main],
        source: 'package.json',
      });
    }
  }

  // 可执行文件：优先与目录同名的 exe，其次唯一的 exe
  const exes = fileNames.filter((n) => /\.exe$/i.test(n));
  if (exes.length) {
    const folder = path.basename(abs).toLowerCase();
    const sameName = exes.find((n) => path.parse(n).name.toLowerCase() === folder);
    if (sameName) {
      startCandidates.push(startSuggestion(sameName, 'exe'));
    } else {
      for (const exe of exes.slice(0, 3)) startCandidates.push(startSuggestion(exe, 'exe'));
    }
  }

  // jar：java -jar
  const jars = fileNames.filter((n) => /\.jar$/i.test(n));
  if (jars.length) startCandidates.push(startSuggestion(jars[0], 'jar'));

  // Python 入口
  for (const name of ['main.py', 'app.py', 'server.py']) {
    const actual = files.get(name);
    if (actual) {
      startCandidates.push(startSuggestion(actual, 'python'));
      break;
    }
  }
  if (files.has('manage.py')) {
    startCandidates.push({
      label: 'python manage.py runserver',
      command: 'python',
      args: ['manage.py', 'runserver'],
      source: 'python',
    });
  }

  const start = startCandidates[0] ?? null;
  const port = guessPort(abs, files, pkg, scriptFiles);

  // —— 类型建议 ——
  let kind = marker?.kind ?? null;
  if (!kind) {
    if (exes.length) kind = 'desktop-app';
    else if (hasGit) kind = 'cli-tool';
  }

  // —— 是否已被管理 ——
  let managed = false;
  let projects = options.registryProjects;
  if (!Array.isArray(projects)) {
    try {
      projects = loadRegistry().projects;
    } catch {
      projects = [];
    }
  }
  if (projects.length) {
    const key = abs.toLowerCase();
    managed = projects.some(
      (p) => typeof p?.path === 'string' && path.resolve(expandPath(p.path)).toLowerCase() === key,
    );
  }

  return {
    exists: true,
    path: abs,
    name: path.basename(abs),
    kind,
    kindLabel: marker?.label ?? (kind === 'desktop-app' ? '桌面程序' : kind === 'cli-tool' ? 'CLI 工具' : '未知'),
    git: hasGit,
    markers: markers.map((m) => m.file),
    exeFiles: exes,
    start,
    startCandidates: startCandidates.slice(0, 8),
    port,
    ports: port ? [port] : [],
    update: hasGit ? 'git' : 'none',
    managed,
  };
}
