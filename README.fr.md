# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · **Français** · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Un lanceur local pour tous vos projets GitHub : état, démarrage/arrêt et mise à jour en un clic.

Service Node.js sans dépendance avec un tableau de bord d'une seule page. Il surveille vos projets, les démarre et les arrête, et récupère les mises à jour sans jamais modifier leur code.

## Démarrage rapide

```bash
node src/index.js
```

Ouvrir: http://127.0.0.1:8780

Nécessite Node.js 20+. Windows entièrement pris en charge ; Linux/macOS utilisent la couche de plateforme intégrée.

## Fonctionnalités

- **État en un coup d'œil** — état, ports, PID et durée de fonctionnement, rafraîchis toutes les 3 s.
- **Démarrer / arrêter / redémarrer** — réutilise le script de démarrage propre à chaque projet.
- **Mise à jour en un clic** — remise temporaire des modifications non validées, mise à jour puis restauration ; retour arrière en cas d'échec.
- **Tout type de stack** — Next.js, FastAPI, binaires Go, Godot, pygame et services pip dans un seul tableau.
- **Interface bilingue et thème clair/sombre** — bascule dans l'en-tête, mémorisée localement.
- **Lanceur uniquement** — n'exécute jamais git init et n'écrit pas dans les projets gérés.

## Projets gérés

| Projet | Stack | Port | Mise à jour |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | synchronisation du fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manuel |
| wb2api-panel | Go | 7863 | manuel |
| REA | TypeScript / CLI | — | manuel |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manuel |

## Sécurité et isolation

- Écoute uniquement sur 127.0.0.1, sans authentification (outil local mono-utilisateur).
- La configuration et les journaux locaux sont exclus de git ; seul un exemple portable est publié.
- N'écrit jamais dans les projets gérés ; la seule écriture est la mise à jour que vous déclenchez.

## Documentation

- [Conception et architecture (chinois)](docs/design.md)
- [README détaillé (chinois)](docs/README.full.zh-CN.md)
- `npm test` — 111 tests : analyse, validation de configuration, flux git et rendu du tableau de bord
