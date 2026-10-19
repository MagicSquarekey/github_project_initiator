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
  ['zh-CN', 'README.zh-CN.md'],
  ['zh-TW', 'README.zh-TW.md'],
  ['ja', 'README.ja.md'],
  ['ko', 'README.ko.md'],
  ['es', 'README.es.md'],
  ['pt', 'README.pt.md'],
  ['fr', 'README.fr.md'],
  ['de', 'README.de.md'],
  ['it', 'README.it.md'],
  ['ru', 'README.ru.md'],
  ['ar', 'README.ar.md'],
  ['hi', 'README.hi.md'],
  ['bn', 'README.bn.md'],
  ['ur', 'README.ur.md'],
  ['fa', 'README.fa.md'],
  ['tr', 'README.tr.md'],
  ['vi', 'README.vi.md'],
  ['th', 'README.th.md'],
  ['id', 'README.id.md'],
  ['ms', 'README.ms.md'],
  ['nl', 'README.nl.md'],
  ['pl', 'README.pl.md'],
  ['uk', 'README.uk.md'],
  ['sv', 'README.sv.md'],
  ['cs', 'README.cs.md'],
  ['ro', 'README.ro.md'],
  ['el', 'README.el.md'],
  ['hu', 'README.hu.md'],
  ['he', 'README.he.md'],
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
function switcher(t, current) {
  return LANGS.map(([code, file]) => {
    const name = t[code].name;
    return code === current ? `**${name}**` : `[${name}](${file})`;
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

${switcher(t, code)}

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

- [${tr.designLabel}](docs/design.md)
- [${tr.fullLabel}](docs/README.full.zh-CN.md)
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
    fs.writeFileSync(path.join(root, file), render(code, t), 'utf8');
  }

  console.log(`✅ 已生成 ${LANGS.length} 份 README（${LANGS.map(([c]) => c).join(', ')}）`);
}

// 仅当作为脚本直接运行时生成；被测试 import 时不产生副作用
if (process.argv[1]) {
  const self = fileURLToPath(import.meta.url);
  const invoked = path.resolve(process.argv[1]);
  if (self === invoked) generate();
}
