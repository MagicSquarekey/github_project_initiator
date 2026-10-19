# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · **Українська** · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Локальний лаунчер для всіх ваших проєктів GitHub: статус, запуск/зупинка та оновлення одним кліком.

Сервіс Node.js без залежностей з односторінковою панеллю. Відстежує проєкти, запускає й зупиняє їх, завантажує оновлення — ніколи не змінюючи їхній код.

## Швидкий старт

```bash
node src/index.js
```

Відкрити: http://127.0.0.1:8780

Потрібен Node.js 20+. Windows підтримується повністю; Linux/macOS використовують вбудований рівень платформи.

## Можливості

- **Статус з першого погляду** — стан, порти, PID і час роботи, оновлюється кожні 3 с.
- **Запуск / зупинка / перезапуск** — використовує власний скрипт запуску проєкту.
- **Оновлення одним кліком** — тимчасово зберігає незакомічені зміни, оновлює й відновлює їх; у разі помилки відкочує.
- **Будь-який стек** — Next.js, FastAPI, бінарники Go, Godot, pygame та pip-сервіси в одній таблиці.
- **Двомовний інтерфейс і світла/темна тема** — перемикання в шапці, запам'ятовується локально.
- **Лише лаунчер** — ніколи не виконує git init і не пише в керовані проєкти.

## Керовані проєкти

| Проєкт | Стек | Порт | Оновлення |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | синхронізація форку |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | вручну |
| wb2api-panel | Go | 7863 | вручну |
| REA | TypeScript / CLI | — | вручну |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | вручну |

## Безпека та ізоляція

- Слухає лише 127.0.0.1, без автентифікації (локальний інструмент для одного користувача).
- Локальна конфігурація та журнали виключені з git; публікується лише переносний приклад.
- Ніколи не пише в керовані проєкти; єдиний запис — оновлення, яке запускаєте ви.

## Документація

- [Дизайн та архітектура (китайською)](docs/design.md)
- [Детальний README (китайською)](docs/README.full.zh-CN.md)
- `npm test` — 111 тестів: парсинг, перевірка конфігурації, git-процеси та рендеринг панелі
