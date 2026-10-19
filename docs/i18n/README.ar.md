# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · **العربية** · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> مشغّل محلي لجميع مشاريع GitHub الخاصة بك: الحالة، التشغيل/الإيقاف، والتحديث بنقرة واحدة.

خدمة Node.js بدون تبعيات مع لوحة تحكم من صفحة واحدة. تراقب مشاريعك وتشغّلها وتوقفها وتجلب التحديثات دون تعديل شيفرتها إطلاقًا.

## البدء السريع

```bash
node src/index.js
```

افتح: http://127.0.0.1:8780

يتطلب Node.js 20+. Windows مدعوم بالكامل؛ ويستخدم Linux/macOS طبقة المنصات المدمجة.

## المزايا

- **الحالة في لمحة** — حالة التشغيل والمنافذ ومعرّفات العمليات ومدة التشغيل، تُحدَّث كل 3 ثوانٍ.
- **تشغيل / إيقاف / إعادة تشغيل** — يعيد استخدام سكربت التشغيل الخاص بكل مشروع.
- **تحديث بنقرة واحدة** — يحفظ التغييرات غير الملتزم بها مؤقتًا، ثم يحدّث ويعيدها؛ وعند الفشل يتراجع.
- **أي تقنية** — Next.js وFastAPI وملفات Go التنفيذية وGodot وpygame وخدمات pip في جدول واحد.
- **واجهة ثنائية اللغة وسمة فاتحة/داكنة** — التبديل من الشريط العلوي، ويُحفظ محليًا.
- **مشغّل فقط** — لا ينفّذ git init ولا يكتب في المشاريع المُدارة.

## المشاريع المُدارة

| المشروع | التقنية | المنفذ | التحديث |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | مزامنة النسخة المتفرعة |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | يدوي |
| wb2api-panel | Go | 7863 | يدوي |
| REA | TypeScript / CLI | — | يدوي |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | يدوي |

## الأمان والعزل

- يستمع على 127.0.0.1 فقط، دون مصادقة (أداة محلية لمستخدم واحد).
- الإعدادات والسجلات المحلية مستثناة من git؛ ولا يُنشر سوى مثال قابل للنقل.
- لا يكتب أبدًا في المشاريع المُدارة؛ الكتابة الوحيدة هي التحديث الذي تشغّله أنت.

## التوثيق

- [التصميم والبنية (بالصينية)](../design.md)
- [README مفصّل (بالصينية)](../README.full.zh-CN.md)
- `npm test` — 111 اختبارًا: التحليل، التحقق من الإعدادات، مسارات git، وعرض اللوحة
