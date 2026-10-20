# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · **Svenska** · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> En lokal startare för alla dina GitHub-projekt: status, start/stopp och uppdatering med ett klick.

En Node.js-tjänst utan beroenden med en enkelsidig instrumentpanel. Den övervakar dina projekt, startar och stoppar dem och hämtar uppdateringar – utan att någonsin ändra deras kod.

## Snabbstart

```bash
node src/index.js
```

Öppna: http://127.0.0.1:8780

Kräver Node.js 20+. Windows stöds fullt ut; Linux/macOS använder det inbyggda plattformslagret.

## Funktioner

- **Status i en blick** — körstatus, portar, PID:er och drifttid, uppdateras var 3:e sekund.
- **Starta / stoppa / starta om** — använder varje projekts eget startskript.
- **Uppdatering med ett klick** — sparbar tillfälligt ej committade ändringar, uppdaterar och återställer dem; rullar tillbaka vid fel.
- **Vilken stack som helst** — Next.js, FastAPI, Go-binärer, Godot, pygame och pip-tjänster i en tabell.
- **Lägg till projekt från instrumentpanelen** — välj en mapp; startkommando och port identifieras automatiskt, ingen JSON-redigering.
- **Tvåspråkigt gränssnitt och ljust/mörkt tema** — växlas i sidhuvudet, sparas lokalt.
- **Endast startare** — kör aldrig git init och skriver inte i hanterade projekt.

## Hanterade projekt

| Projekt | Stack | Port | Uppdatering |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | forksynkronisering |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manuell |
| wb2api-panel | Go | 7863 | manuell |
| REA | TypeScript / CLI | — | manuell |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manuell |

## Säkerhet och isolering

- Lyssnar endast på 127.0.0.1, utan autentisering (lokalt verktyg för en användare).
- Lokal konfiguration och loggar ligger utanför git; endast ett portabelt exempel publiceras.
- Skriver aldrig i hanterade projekt; den enda skrivningen är uppdateringen du startar.

## Dokumentation

- [Design och arkitektur (kinesiska)](../design.md)
- [Detaljerad README (kinesiska)](../README.full.zh-CN.md)
- `npm test` — 190 tester: parsning, konfigurationsvalidering, git-flöden och instrumentpanelsrendering
