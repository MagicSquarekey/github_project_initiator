# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · **اردو** · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> آپ کے تمام GitHub پروجیکٹس کے لیے ایک مقامی لانچر: اسٹیٹس، اسٹارٹ/اسٹاپ اور ایک کلک اپ ڈیٹ۔

بغیر کسی انحصار کے Node.js سروس اور سنگل پیج ڈیش بورڈ۔ یہ آپ کے پروجیکٹس کی نگرانی کرتی ہے، انہیں چلاتی اور بند کرتی ہے اور اپ ڈیٹس لاتی ہے — ان کا کوڈ کبھی بدلے بغیر۔

## فوری آغاز

```bash
node src/index.js
```

کھولیں: http://127.0.0.1:8780

Node.js 20+ درکار۔ Windows مکمل طور پر معاون؛ Linux/macOS بلٹ ان پلیٹ فارم لیئر استعمال کرتے ہیں۔

## خصوصیات

- **ایک نظر میں اسٹیٹس** — چلنے کی حالت، پورٹس، PID اور اپ ٹائم، ہر 3 سیکنڈ میں تازہ۔
- **اسٹارٹ / اسٹاپ / ری اسٹارٹ** — ہر پروجیکٹ کی اپنی اسٹارٹ اسکرپٹ استعمال کرتا ہے۔
- **ایک کلک اپ ڈیٹ** — غیر کمیٹ شدہ تبدیلیاں عارضی طور پر محفوظ کرتا ہے، اپ ڈیٹ کرتا ہے اور واپس بحال کرتا ہے؛ ناکامی پر رول بیک۔
- **کوئی بھی اسٹیک** — Next.js، FastAPI، Go بائنریز، Godot، pygame اور pip سروسز ایک ہی جدول میں۔
- **دو لسانی UI اور لائٹ/ڈارک** — ہیڈر سے تبدیل کریں، ترجیح مقامی طور پر محفوظ۔
- **صرف لانچر** — منظم پروجیکٹس میں کبھی git init نہیں چلاتا اور نہ لکھتا ہے۔

## منظم پروجیکٹس

| پروجیکٹ | اسٹیک | پورٹ | اپ ڈیٹ |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | فورک سنک |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | دستی |
| wb2api-panel | Go | 7863 | دستی |
| REA | TypeScript / CLI | — | دستی |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | دستی |

## سیکیورٹی اور تنہائی

- صرف 127.0.0.1 پر سنتا ہے، کوئی تصدیق نہیں (ایک صارف کا مقامی ٹول)۔
- مقامی کنفیگ اور لاگز git سے خارج ہیں؛ صرف ایک پورٹیبل مثال شائع ہوتی ہے۔
- منظم پروجیکٹس میں کبھی نہیں لکھتا؛ واحد تحریر وہ اپ ڈیٹ ہے جو آپ چلاتے ہیں۔

## دستاویزات

- [ڈیزائن اور آرکیٹیکچر (چینی میں)](docs/design.md)
- [تفصیلی README (چینی میں)](docs/README.full.zh-CN.md)
- `npm test` — 111 ٹیسٹ: پارسنگ، کنفیگ کی توثیق، git فلو اور ڈیش بورڈ رینڈرنگ
