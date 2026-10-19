# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · **فارسی** · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> یک لانچر محلی برای همه پروژه‌های GitHub شما: وضعیت، اجرا/توقف و به‌روزرسانی با یک کلیک.

سرویس Node.js بدون وابستگی با داشبورد تک‌صفحه‌ای. پروژه‌های شما را پایش می‌کند، اجرا و متوقف می‌کند و به‌روزرسانی می‌گیرد، بدون اینکه هرگز کد آن‌ها را تغییر دهد.

## شروع سریع

```bash
node src/index.js
```

باز کردن: http://127.0.0.1:8780

نیازمند Node.js 20+. ویندوز کاملاً پشتیبانی می‌شود؛ Linux/macOS از لایه پلتفرم داخلی استفاده می‌کنند.

## ویژگی‌ها

- **وضعیت در یک نگاه** — حالت اجرا، پورت‌ها، PID و مدت اجرا، هر ۳ ثانیه تازه‌سازی.
- **اجرا / توقف / راه‌اندازی مجدد** — از اسکریپت اجرای خود هر پروژه استفاده می‌کند.
- **به‌روزرسانی با یک کلیک** — تغییرات ثبت‌نشده را موقتاً ذخیره، به‌روزرسانی و سپس بازگردانی می‌کند؛ در صورت خطا عقب‌گرد.
- **هر پشته‌ای** — Next.js، FastAPI، باینری‌های Go، Godot، pygame و سرویس‌های pip در یک جدول.
- **رابط دوزبانه و تم روشن/تیره** — تغییر از سربرگ، در حافظه محلی.
- **فقط لانچر** — هرگز git init اجرا نمی‌کند و در پروژه‌های مدیریت‌شده نمی‌نویسد.

## پروژه‌های مدیریت‌شده

| پروژه | پشته | پورت | به‌روزرسانی |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | همگام‌سازی فورک |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | دستی |
| wb2api-panel | Go | 7863 | دستی |
| REA | TypeScript / CLI | — | دستی |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | دستی |

## امنیت و جداسازی

- فقط روی 127.0.0.1 گوش می‌دهد، بدون احراز هویت (ابزار محلی تک‌کاربره).
- تنظیمات و لاگ‌های محلی از git خارج هستند؛ فقط یک نمونه قابل‌حمل منتشر می‌شود.
- هرگز در پروژه‌های مدیریت‌شده نمی‌نویسد؛ تنها نوشتن، به‌روزرسانی‌ای است که شما اجرا می‌کنید.

## مستندات

- [طراحی و معماری (به چینی)](../design.md)
- [README مفصل (به چینی)](../README.full.zh-CN.md)
- `npm test` — ۱۱۱ تست: تجزیه، اعتبارسنجی تنظیمات، جریان‌های git و رندر داشبورد
