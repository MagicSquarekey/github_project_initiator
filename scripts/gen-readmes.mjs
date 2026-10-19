#!/usr/bin/env node
/**
 * 生成多语言 README。
 *
 * 为什么用生成器而不是手写 30 份：
 * 结构必须逐行一致（只换语言），手写必然会漂移。文案集中在 docs/i18n/*.json，
 * 改一处结构，重跑 `npm run readme` 即可让所有语言同步。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i18nDir = path.join(root, 'docs', 'i18n');

/** 语言顺序即语言切换器的显示顺序；en 是默认 README.md */
export const LANGS = [
  ['en', 'README.md'],
  ['zh-CN', 'docs/i18n/README.zh-CN.md'],
  ['zh-TW', 'docs/i18n/README.zh-TW.md'],
  ['ja', 'docs/i18n/README.ja.md'],
  ['ko', 'docs/i18n/README.ko.md'],
  ['es', 'docs/i18n/README.es.md'],
  ['pt', 'docs/i18n/README.pt.md'],
  ['fr', 'docs/i18n/README.fr.md'],
  ['de', 'docs/i18n/README.de.md'],
  ['it', 'docs/i18n/README.it.md'],
  ['ru', 'docs/i18n/README.ru.md'],
  ['ar', 'docs/i18n/README.ar.md'],
  ['hi', 'docs/i18n/README.hi.md'],
  ['bn', 'docs/i18n/README.bn.md'],
  ['ur', 'docs/i18n/README.ur.md'],
  ['fa', 'docs/i18n/README.fa.md'],
  ['tr', 'docs/i18n/README.tr.md'],
  ['vi', 'docs/i18n/README.vi.md'],
  ['th', 'docs/i18n/README.th.md'],
  ['id', 'docs/i18n/README.id.md'],
  ['ms', 'docs/i18n/README.ms.md'],
  ['nl', 'docs/i18n/README.nl.md'],
  ['pl', 'docs/i18n/README.pl.md'],
  ['uk', 'docs/i18n/README.uk.md'],
  ['sv', 'docs/i18n/README.sv.md'],
  ['cs', 'docs/i18n/README.cs.md'],
  ['ro', 'docs/i18n/README.ro.md'],
  ['el', 'docs/i18n/README.el.md'],
  ['hu', 'docs/i18n/README.hu.md'],
  ['he', 'docs/i18n/README.he.md'],
];

/** 两个小节标题（JSON 里没放，集中在这里便于对照） */
const TITLES = {
  en: ['Features', 'Security & isolation'],
  'zh-CN': ['功能', '安全与隔离'],
  'zh-TW': ['功能', '安全與隔離'],
  ja: ['機能', 'セキュリティと分離'],
  ko: ['기능', '보안 및 격리'],
  es: ['Funciones', 'Seguridad y aislamiento'],
  pt: ['Recursos', 'Segurança e isolamento'],
  fr: ['Fonctionnalités', 'Sécurité et isolation'],
  de: ['Funktionen', 'Sicherheit und Isolation'],
  it: ['Funzioni', 'Sicurezza e isolamento'],
  ru: ['Возможности', 'Безопасность и изоляция'],
  ar: ['المزايا', 'الأمان والعزل'],
  hi: ['विशेषताएँ', 'सुरक्षा और अलगाव'],
  bn: ['বৈশিষ্ট্য', 'নিরাপত্তা ও বিচ্ছিন্নতা'],
  ur: ['خصوصیات', 'سیکیورٹی اور تنہائی'],
  fa: ['ویژگی‌ها', 'امنیت و جداسازی'],
  tr: ['Özellikler', 'Güvenlik ve yalıtım'],
  vi: ['Tính năng', 'Bảo mật và cô lập'],
  th: ['คุณสมบัติ', 'ความปลอดภัยและการแยกส่วน'],
  id: ['Fitur', 'Keamanan dan isolasi'],
  ms: ['Ciri', 'Keselamatan dan pengasingan'],
  nl: ['Functies', 'Beveiliging en isolatie'],
  pl: ['Funkcje', 'Bezpieczeństwo i izolacja'],
  uk: ['Можливості', 'Безпека та ізоляція'],
  sv: ['Funktioner', 'Säkerhet och isolering'],
  cs: ['Funkce', 'Bezpečnost a izolace'],
  ro: ['Funcții', 'Securitate și izolare'],
  el: ['Δυνατότητες', 'Ασφάλεια και απομόνωση'],
  hu: ['Funkciók', 'Biztonság és elkülönítés'],
  he: ['יכולות', 'אבטחה ובידוד'],
};

/** 项目表：名称与栈保持原样，更新方式按语言翻译 */
const PROJECTS = [
  ['LibreTV', 'Next.js 15', '8090', 0],
  ['githubPopularProjects', 'Next.js 15', '3000', 1],
  ['AutoTestHub', 'FastAPI + Vue', '8686 / 5173', 1],
  ['qoder2api-hub', 'Python', '8790', 2],
  ['wb2api-panel', 'Go', '7863', 2],
  ['REA', 'TypeScript / CLI', '—', 2],
  ['2048', 'pygame', '—', 1],
  ['Grimoire-Echoes', 'Godot 4', '—', 1],
  ['OpenViking', 'Python', '1933', 2],
];

/**
 * 读取并合并所有翻译分片。
 *
 * @returns {Record<string, any>}
 */
export function loadTranslations() {
  const parts = fs
    .readdirSync(i18nDir)
    .filter((f) => f.startsWith('readme-part') && f.endsWith('.json'))
    .sort();

  if (parts.length === 0) throw new Error('docs/i18n/readme-part*.json 不存在');

  const merged = {};
  for (const file of parts) {
    Object.assign(merged, JSON.parse(fs.readFileSync(path.join(i18nDir, file), 'utf8')));
  }
  return merged;
}

/**
 * 生成语言切换器。当前语言加粗、不带链接。
 *
 * @param {Record<string, any>} t
 * @param {string} current
 * @returns {string}
 */
function switcher(t, current, nested) {
  return LANGS.map(([code, file]) => {
    const name = t[code].name;
    if (code === current) return `**${name}**`;

    // 从当前文件所在目录出发计算相对链接：
    //   根目录 README.md      → docs/i18n/README.xx.md
    //   docs/i18n/README.xx   → 同级用文件名，英文用 ../../README.md
    const target = nested
      ? (file === 'README.md' ? '../../README.md' : file.replace('docs/i18n/', ''))
      : file;
    return `[${name}](${target})`;
  }).join(' · ');
}

/**
 * 渲染一份 README。
 *
 * @param {string} code
 * @param {Record<string, any>} t
 * @returns {string}
 */
export function render(code, t) {
  const tr = t[code];
  const [featuresTitle, securityTitle] = TITLES[code];
  const file = LANGS.find(([c]) => c === code)[1];
  const nested = file.includes('/');
  const designHref = nested ? '../design.md' : 'docs/design.md';
  const fullHref = nested ? '../README.full.zh-CN.md' : 'docs/README.full.zh-CN.md';

  const featureLines = tr.features
    .map(([title, desc]) => `- **${title}** — ${desc}`)
    .join('\n');

  const projectRows = PROJECTS.map(
    ([name, stack, port, updIndex]) =>
      `| ${name} | ${stack} | ${port} | ${tr.upd[updIndex]} |`,
  ).join('\n');

  const securityLines = tr.security.map((s) => `- ${s}`).join('\n');

  return `# github_project_initiator

<details>
<summary>🌐 Languages · ${LANGS.length}</summary>

${switcher(t, code, nested)}

</details>

> ${tr.tagline}

${tr.intro}

## ${tr.quickstart}

\`\`\`bash
node src/index.js
\`\`\`

${tr.openLabel}: http://127.0.0.1:8780

${tr.req}

## ${featuresTitle}

${featureLines}

## ${tr.projects}

| ${tr.cols[0]} | ${tr.cols[1]} | ${tr.cols[2]} | ${tr.cols[3]} |
|---|---|---|
${projectRows}

## ${securityTitle}

${securityLines}

## ${tr.docs}

- [${tr.designLabel}](${designHref})
- [${tr.fullLabel}](${fullHref})
- \`npm test\` — ${tr.testsLabel}
`;
}

export function generate() {
  const t = loadTranslations();

  const missing = LANGS.filter(([code]) => !t[code]).map(([code]) => code);
  if (missing.length) {
    throw new Error(`缺少翻译：${missing.join(', ')}`);
  }

  for (const [code, file] of LANGS) {
    const out = path.join(root, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, render(code, t), 'utf8');
  }

  console.log(`✅ 已生成 ${LANGS.length} 份 README（${LANGS.map(([c]) => c).join(', ')}）`);
}

// 仅当作为脚本直接运行时生成；被测试 import 时不产生副作用
if (process.argv[1]) {
  const self = fileURLToPath(import.meta.url);
  const invoked = path.resolve(process.argv[1]);
  if (self === invoked) generate();
}
