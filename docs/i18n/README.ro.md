# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · **Română** · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Un launcher local pentru toate proiectele tale GitHub: stare, pornire/oprire și actualizare cu un singur clic.

Serviciu Node.js fără dependențe cu un panou de o singură pagină. Monitorizează proiectele, le pornește și le oprește și descarcă actualizări — fără să le modifice vreodată codul.

## Pornire rapidă

```bash
node src/index.js
```

Deschide: http://127.0.0.1:8780

Necesită Node.js 20+. Windows este complet acceptat; Linux/macOS folosesc stratul de platformă integrat.

## Funcții

- **Stare dintr-o privire** — stare, porturi, PID-uri și timp de funcționare, reîmprospătate la 3 s.
- **Pornire / oprire / repornire** — folosește scriptul de pornire propriu fiecărui proiect.
- **Actualizare cu un clic** — salvează temporar modificările neconfirmate, actualizează și le restaurează; la eroare face rollback.
- **Orice stack** — Next.js, FastAPI, binare Go, Godot, pygame și servicii pip într-un singur tabel.
- **Adăugarea proiectelor din panou** — alege un folder; comanda de pornire și portul sunt detectate automat, fără editare JSON.
- **Interfață bilingvă și temă deschisă/închisă** — comutare din antet, memorată local.
- **Doar launcher** — nu rulează niciodată git init și nu scrie în proiectele gestionate.

## Proiecte gestionate

| Proiect | Stack | Port | Actualizare |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | sincronizare fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manual |
| wb2api-panel | Go | 7863 | manual |
| REA | TypeScript / CLI | — | manual |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manual |

## Securitate și izolare

- Ascultă doar pe 127.0.0.1, fără autentificare (instrument local pentru un singur utilizator).
- Configurația și jurnalele locale sunt excluse din git; se publică doar un exemplu portabil.
- Nu scrie niciodată în proiectele gestionate; singura scriere este actualizarea pe care o pornești.

## Documentație

- [Design și arhitectură (în chineză)](../design.md)
- [README detaliat (în chineză)](../README.full.zh-CN.md)
- `npm test` — 190 teste: parsare, validarea configurației, fluxuri git și randarea panoului
