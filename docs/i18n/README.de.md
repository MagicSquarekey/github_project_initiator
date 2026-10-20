# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · **Deutsch** · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Ein lokaler Launcher für alle deine GitHub-Projekte: Status, Start/Stopp und Update mit einem Klick.

Ein abhängigkeitsfreier Node.js-Dienst mit einseitigem Dashboard. Er überwacht deine Projekte, startet und stoppt sie und lädt Updates – ohne jemals deren Code zu verändern.

## Schnellstart

```bash
node src/index.js
```

Öffnen: http://127.0.0.1:8780

Erfordert Node.js 20+. Windows voll unterstützt; Linux/macOS nutzen die integrierte Plattformschicht.

## Funktionen

- **Status auf einen Blick** — Laufzustand, Ports, PIDs und Laufzeit, alle 3 Sekunden aktualisiert.
- **Starten / Stoppen / Neustarten** — nutzt das jeweilige Startskript des Projekts.
- **Update mit einem Klick** — sichert nicht committete Änderungen, aktualisiert und stellt sie wieder her; bei Fehlern wird zurückgerollt.
- **Jeder Stack** — Next.js, FastAPI, Go-Binaries, Godot, pygame und pip-Dienste in einer Tabelle.
- **Projekte im Dashboard hinzufügen** — Ordner wählen, Startbefehl und Port werden automatisch erkannt – kein JSON-Editieren.
- **Zweisprachige UI und Hell/Dunkel** — Umschaltung in der Kopfzeile, lokal gespeichert.
- **Nur Launcher** — führt nie git init aus und schreibt nicht in verwaltete Projekte.

## Verwaltete Projekte

| Projekt | Stack | Port | Update |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | Fork-Synchronisierung |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manuell |
| wb2api-panel | Go | 7863 | manuell |
| REA | TypeScript / CLI | — | manuell |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manuell |

## Sicherheit und Isolation

- Lauscht nur auf 127.0.0.1, ohne Authentifizierung (lokales Einzelbenutzer-Werkzeug).
- Lokale Konfiguration und Logs sind von git ausgeschlossen; veröffentlicht wird nur ein portables Beispiel.
- Schreibt nie in verwaltete Projekte; die einzige Schreiboperation ist das von dir ausgelöste Update.

## Dokumentation

- [Design und Architektur (Chinesisch)](../design.md)
- [Ausführliches README (Chinesisch)](../README.full.zh-CN.md)
- `npm test` — 190 Tests: Parsing, Konfigurationsprüfung, Git-Abläufe und Dashboard-Rendering
