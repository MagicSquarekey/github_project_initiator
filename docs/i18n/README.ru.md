# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · **Русский** · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Локальный лаунчер для всех ваших проектов на GitHub: статус, запуск/остановка и обновление в один клик.

Сервис на Node.js без зависимостей с одностраничной панелью. Следит за проектами, запускает и останавливает их, загружает обновления и никогда не изменяет их код.

## Быстрый старт

```bash
node src/index.js
```

Открыть: http://127.0.0.1:8780

Требуется Node.js 20+. Windows поддерживается полностью; в Linux/macOS используется встроенный слой платформы.

## Возможности

- **Статус одним взглядом** — состояние, порты, PID и время работы, обновление каждые 3 с.
- **Запуск / остановка / перезапуск** — используется собственный скрипт запуска проекта.
- **Обновление в один клик** — незакоммиченные изменения временно сохраняются, затем восстанавливаются; при ошибке выполняется откат.
- **Любой стек** — Next.js, FastAPI, бинарники Go, Godot, pygame и pip-сервисы в одной таблице.
- **Двуязычный интерфейс и светлая/тёмная тема** — переключение в шапке, запоминается локально.
- **Только лаунчер** — никогда не выполняет git init и не пишет в управляемые проекты.

## Управляемые проекты

| Проект | Стек | Порт | Обновление |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | синхронизация форка |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | вручную |
| wb2api-panel | Go | 7863 | вручную |
| REA | TypeScript / CLI | — | вручную |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | вручную |

## Безопасность и изоляция

- Слушает только 127.0.0.1, без аутентификации (локальный инструмент для одного пользователя).
- Локальная конфигурация и журналы исключены из git; публикуется только переносимый пример.
- Никогда не пишет в управляемые проекты; единственная запись — обновление, которое вы запускаете.

## Документация

- [Архитектура и дизайн (на китайском)](../design.md)
- [Подробный README (на китайском)](../README.full.zh-CN.md)
- `npm test` — 111 тестов: парсинг, проверка конфигурации, git-процессы и рендеринг панели
