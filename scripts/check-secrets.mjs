#!/usr/bin/env node
/**
 * 开源发布前安全检查。
 *
 * 扫描 **git 跟踪的文件**，发现个人绝对路径或疑似凭据就失败。
 * 为什么需要：这个仓库要公开，但配置里很容易混入 C:/Users/<你的名字>/...
 * 或误提交的密钥。靠人肉 review 不可靠，放进 CI / 发布前钩子。
 *
 * 用法：
 *   npm run check
 *   node scripts/check-secrets.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** 需要检查的文本扩展名（二进制一律跳过） */
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.txt', '.yml', '.yaml',
  '.html', '.css', '.ps1', '.bat', '.cmd', '.sh', '.toml', '.ini', '.conf',
]);

/**
 * 检查规则。每条给出可读的标签，命中后直接告诉用户是什么问题。
 */
const RULES = [
  {
    id: 'home-path',
    label: '个人绝对路径（会泄露用户名）',
    // 形如 <盘符>:/Users/<名字>、/home/<名字>、/Users/<名字>
    re: /(?:[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`<>]+|\/(?:home|Users)\/[^\/\s"'`<>]+)/g,
  },
  {
    id: 'api-key',
    label: '疑似 API Key',
    re: /\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
  },
  {
    id: 'secret-assignment',
    label: '疑似密钥赋值',
    re: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  },
  {
    id: 'private-key',
    label: '私钥内容',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
];

/**
 * 允许出现的占位写法（示例配置、文档模板）。
 */
const ALLOW = [
  /C:[\\/]+Users[\\/]+<[^>]*>/, // C:/Users/<your-name>
  /\$\{HOME\}/,                 // ${HOME}
  /\/home\/<[^>]*>/,
  /\/Users\/<[^>]*>/,
];

/**
 * 该行是否只是允许的占位写法（示例配置、文档模板）。
 *
 * @param {string} line
 * @returns {boolean}
 */
function isAllowed(line) {
  return ALLOW.some((a) => new RegExp(a.source, a.flags).test(line));
}

/**
 * 扫描一个文件，返回命中列表。
 *
 * @param {string} relPath
 * @returns {{ rule: string, line: number, snippet: string }[]}
 */
function scanFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (!TEXT_EXT.has(ext)) return [];

  let content;
  try {
    content = fs.readFileSync(relPath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const hits = [];

  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const re = new RegExp(rule.re.source, rule.re.flags);
      const matches = [...line.matchAll(re)];
      if (matches.length === 0) continue;
      if (isAllowed(line, re)) continue;
      hits.push({
        rule: rule.label,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
      });
    }
  }

  return hits;
}

function main() {
  let files;
  try {
    files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (err) {
    console.error('无法读取 git 跟踪文件（请在仓库根目录运行）：', err.message);
    process.exit(2);
  }

  const findings = [];
  for (const file of files) {
    for (const hit of scanFile(file)) findings.push({ file, ...hit });
  }

  if (findings.length === 0) {
    console.log(`✅ 安全检查通过：扫描 ${files.length} 个跟踪文件，未发现个人路径或凭据`);
    return;
  }

  console.error(`❌ 发现 ${findings.length} 处敏感信息（开源前必须处理）：\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
    console.error(`    ${f.snippet}`);
  }
  console.error('\n提示：本机配置请放 data/registry.json（已被 .gitignore 忽略），');
  console.error('      入库的只有可移植的 data/registry.example.json。');
  process.exit(1);
}

main();
