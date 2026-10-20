# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

**English** · [简体中文](docs/i18n/README.zh-CN.md) · [繁體中文](docs/i18n/README.zh-TW.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [Português](docs/i18n/README.pt.md) · [Français](docs/i18n/README.fr.md) · [Deutsch](docs/i18n/README.de.md) · [Italiano](docs/i18n/README.it.md) · [Русский](docs/i18n/README.ru.md) · [العربية](docs/i18n/README.ar.md) · [हिन्दी](docs/i18n/README.hi.md) · [বাংলা](docs/i18n/README.bn.md) · [اردو](docs/i18n/README.ur.md) · [فارسی](docs/i18n/README.fa.md) · [Türkçe](docs/i18n/README.tr.md) · [Tiếng Việt](docs/i18n/README.vi.md) · [ไทย](docs/i18n/README.th.md) · [Bahasa Indonesia](docs/i18n/README.id.md) · [Bahasa Melayu](docs/i18n/README.ms.md) · [Nederlands](docs/i18n/README.nl.md) · [Polski](docs/i18n/README.pl.md) · [Українська](docs/i18n/README.uk.md) · [Svenska](docs/i18n/README.sv.md) · [Čeština](docs/i18n/README.cs.md) · [Română](docs/i18n/README.ro.md) · [Ελληνικά](docs/i18n/README.el.md) · [Magyar](docs/i18n/README.hu.md) · [עברית](docs/i18n/README.he.md)

</details>

> One local launcher for all your GitHub projects: status, start/stop, one-click update.

A zero-dependency Node.js service with a single-page dashboard. It watches the projects on your machine, starts and stops them, and pulls updates — without ever touching their code.

## Quick start

```bash
node src/index.js
```

Open: http://127.0.0.1:8780

Requires Node.js 20+. Windows is fully supported; Linux/macOS use the built-in platform layer.

## Features

- **Status at a glance** — live running state, ports, PIDs and uptime, refreshed every 3 seconds.
- **Start / stop / restart** — reuses each project's own start script, so its original environment handling is preserved.
- **One-click update** — automatically stashes uncommitted changes, pulls, then restores them; failures roll back.
- **Any stack** — Next.js, FastAPI, Go binaries, Godot, pygame and pip-installed services in one table.
- **Add projects in the dashboard** — pick a folder; the start command and port are detected automatically, no JSON editing.
- **Bilingual UI, light/dark** — Chinese/English toggle and theme switch, remembered locally.
- **Launcher only** — never runs git init in, writes to, or restructures the managed projects.

## Managed projects

| Project | Stack | Port | Update |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork sync |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manual |
| wb2api-panel | Go | 7863 | manual |
| REA | TypeScript / CLI | — | manual |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manual |

## Security & isolation

- Listens on 127.0.0.1 only; no authentication (single-user local tool).
- Your local config and logs are git-ignored; only a portable example is published.
- Never writes into managed projects — the only write is the update you explicitly trigger.

## Documentation

- [Design and architecture (Chinese)](docs/design.md)
- [Detailed README (Chinese)](docs/README.full.zh-CN.md)
- `npm test` — 190 tests: parsing, config validation, git flows, dashboard rendering
