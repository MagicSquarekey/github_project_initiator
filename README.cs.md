# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · **Čeština** · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Lokální spouštěč pro všechny vaše projekty na GitHubu: stav, spuštění/zastavení a aktualizace jedním kliknutím.

Služba Node.js bez závislostí s jednostránkovým panelem. Sleduje vaše projekty, spouští a zastavuje je a stahuje aktualizace – aniž by kdy změnila jejich kód.

## Rychlý start

```bash
node src/index.js
```

Otevřít: http://127.0.0.1:8780

Vyžaduje Node.js 20+. Windows je plně podporován; Linux/macOS používají vestavěnou platformovou vrstvu.

## Funkce

- **Stav na první pohled** — stav, porty, PID a doba běhu, obnovováno každé 3 s.
- **Spustit / zastavit / restartovat** — používá vlastní spouštěcí skript každého projektu.
- **Aktualizace jedním kliknutím** — dočasně uloží necommitnuté změny, aktualizuje a poté je obnoví; při chybě vrátí zpět.
- **Jakýkoli stack** — Next.js, FastAPI, binárky Go, Godot, pygame a pip služby v jedné tabulce.
- **Dvojjazyčné UI a světlý/tmavý režim** — přepínání v záhlaví, ukládá se lokálně.
- **Pouze spouštěč** — nikdy nespouští git init ani nezapisuje do spravovaných projektů.

## Spravované projekty

| Projekt | Stack | Port | Aktualizace |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | synchronizace forku |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | ručně |
| wb2api-panel | Go | 7863 | ručně |
| REA | TypeScript / CLI | — | ručně |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | ručně |

## Bezpečnost a izolace

- Poslouchá pouze na 127.0.0.1, bez autentizace (lokální nástroj pro jednoho uživatele).
- Lokální konfigurace a logy jsou mimo git; publikuje se pouze přenosný příklad.
- Nikdy nezapisuje do spravovaných projektů; jediný zápis je aktualizace, kterou spustíte.

## Dokumentace

- [Design a architektura (čínsky)](docs/design.md)
- [Podrobný README (čínsky)](docs/README.full.zh-CN.md)
- `npm test` — 111 testů: parsování, validace konfigurace, git toky a vykreslování panelu
