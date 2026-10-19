# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

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
- `npm test` — 111 tests: parsing, config validation, git flows, dashboard rendering
