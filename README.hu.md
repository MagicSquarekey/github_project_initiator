# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · **Magyar** · [עברית](README.he.md)

</details>

> Egy helyi indító az összes GitHub-projektedhez: állapot, indítás/leállítás és egykattintásos frissítés.

Függőségek nélküli Node.js szolgáltatás egylapos irányítópulttal. Figyeli a projektjeidet, elindítja és leállítja őket, valamint frissítéseket tölt le – anélkül, hogy valaha módosítaná a kódjukat.

## Gyors indítás

```bash
node src/index.js
```

Megnyitás: http://127.0.0.1:8780

Node.js 20+ szükséges. A Windows teljesen támogatott; a Linux/macOS a beépített platformréteget használja.

## Funkciók

- **Állapot egy pillantásra** — futási állapot, portok, PID-ek és üzemidő, 3 másodpercenként frissül.
- **Indítás / leállítás / újraindítás** — minden projekt saját indítószkriptjét használja.
- **Frissítés egy kattintással** — ideiglenesen elmenti a nem commitolt változásokat, frissít, majd visszaállítja; hiba esetén visszagörget.
- **Bármilyen stack** — Next.js, FastAPI, Go binárisok, Godot, pygame és pip szolgáltatások egy táblában.
- **Kétnyelvű felület és világos/sötét téma** — a fejlécből váltható, helyben megjegyzett.
- **Csak indító** — soha nem futtat git init-et és nem ír a kezelt projektekbe.

## Kezelt projektek

| Projekt | Stack | Port | Frissítés |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork szinkronizálás |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | kézi |
| wb2api-panel | Go | 7863 | kézi |
| REA | TypeScript / CLI | — | kézi |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | kézi |

## Biztonság és elkülönítés

- Csak a 127.0.0.1 címen figyel, hitelesítés nélkül (egyszerű felhasználós helyi eszköz).
- A helyi konfiguráció és naplók kívül esnek a git-en; csak egy hordozható példa kerül publikálásra.
- Soha nem ír a kezelt projektekbe; az egyetlen írás az általad indított frissítés.

## Dokumentáció

- [Tervezés és architektúra (kínaiul)](docs/design.md)
- [Részletes README (kínaiul)](docs/README.full.zh-CN.md)
- `npm test` — 111 teszt: elemzés, konfiguráció-ellenőrzés, git folyamatok és irányítópult-renderelés
