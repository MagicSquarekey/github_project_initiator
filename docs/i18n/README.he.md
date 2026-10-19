# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · **עברית**

</details>

> מפעיל מקומי לכל פרויקטי ה-GitHub שלך: סטטוס, הפעלה/עצירה ועדכון בלחיצה אחת.

שירות Node.js ללא תלויות עם לוח בקרה בעמוד אחד. הוא מנטר את הפרויקטים, מפעיל ועוצר אותם ומוריד עדכונים — בלי לשנות את הקוד שלהם לעולם.

## התחלה מהירה

```bash
node src/index.js
```

פתח: http://127.0.0.1:8780

דורש Node.js 20+. Windows נתמך במלואו; Linux/macOS משתמשים בשכבת הפלטפורמה המובנית.

## יכולות

- **סטטוס במבט אחד** — מצב ריצה, פורטים, מזהי תהליכים וזמן פעילות, מתרענן כל 3 שניות.
- **הפעלה / עצירה / הפעלה מחדש** — משתמש בסקריפט ההפעלה של כל פרויקט.
- **עדכון בלחיצה אחת** — שומר זמנית שינויים שלא נשמרו ב-commit, מעדכן ומשחזר אותם; בכישלון מבצע rollback.
- **כל סטאק** — Next.js, FastAPI, קבצי בינארי של Go, Godot, pygame ושירותי pip בטבלה אחת.
- **ממשק דו-לשוני ותמה בהירה/כהה** — החלפה מהכותרת, נשמרת מקומית.
- **מפעיל בלבד** — אף פעם לא מריץ git init ולא כותב לפרויקטים המנוהלים.

## פרויקטים מנוהלים

| פרויקט | סטאק | פורט | עדכון |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | סנכרון fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | ידני |
| wb2api-panel | Go | 7863 | ידני |
| REA | TypeScript / CLI | — | ידני |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | ידני |

## אבטחה ובידוד

- מאזין רק על 127.0.0.1, ללא אימות (כלי מקומי למשתמש יחיד).
- התצורה והלוגים המקומיים מוחרגים מ-git; מתפרסם רק דוגמה ניידת.
- אף פעם לא כותב לפרויקטים המנוהלים; הכתיבה היחידה היא העדכון שאתה מפעיל.

## תיעוד

- [עיצוב וארכיטקטורה (בסינית)](../design.md)
- [README מפורט (בסינית)](../README.full.zh-CN.md)
- `npm test` — 111 בדיקות: ניתוח, אימות תצורה, זרימות git ורינדור לוח הבקרה
