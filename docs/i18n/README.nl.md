# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · **Nederlands** · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Eén lokale launcher voor al je GitHub-projecten: status, starten/stoppen en updaten met één klik.

Een Node.js-dienst zonder afhankelijkheden met een dashboard op één pagina. Het bewaakt je projecten, start en stopt ze en haalt updates op — zonder ooit hun code aan te passen.

## Snel starten

```bash
node src/index.js
```

Openen: http://127.0.0.1:8780

Vereist Node.js 20+. Windows volledig ondersteund; Linux/macOS gebruiken de ingebouwde platformlaag.

## Functies

- **Status in één oogopslag** — status, poorten, PID's en uptime, elke 3 seconden vernieuwd.
- **Starten / stoppen / herstarten** — gebruikt het eigen startscript van elk project.
- **Updaten met één klik** — niet-gecommitte wijzigingen worden tijdelijk opgeslagen, waarna de update volgt en ze worden hersteld; bij een fout wordt teruggedraaid.
- **Elke stack** — Next.js, FastAPI, Go-binaries, Godot, pygame en pip-diensten in één tabel.
- **Projecten toevoegen vanaf het dashboard** — kies een map; het startcommando en de poort worden automatisch gedetecteerd, geen JSON-bewerking nodig.
- **Tweetalige UI en licht/donker thema** — wisselen in de kop, lokaal onthouden.
- **Alleen launcher** — voert nooit git init uit en schrijft niet in beheerde projecten.

## Beheerde projecten

| Project | Stack | Poort | Update |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork-synchronisatie |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | handmatig |
| wb2api-panel | Go | 7863 | handmatig |
| REA | TypeScript / CLI | — | handmatig |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | handmatig |

## Beveiliging en isolatie

- Luistert alleen op 127.0.0.1, zonder authenticatie (lokaal hulpmiddel voor één gebruiker).
- Lokale configuratie en logs blijven buiten git; alleen een draagbaar voorbeeld wordt gepubliceerd.
- Schrijft nooit in beheerde projecten; de enige schrijfactie is de update die jij start.

## Documentatie

- [Ontwerp en architectuur (Chinees)](../design.md)
- [Uitgebreide README (Chinees)](../README.full.zh-CN.md)
- `npm test` — 190 tests: parsing, configuratievalidatie, git-flows en dashboard-rendering
