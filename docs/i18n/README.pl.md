# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · **Polski** · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Lokalny launcher dla wszystkich Twoich projektów GitHub: status, uruchamianie/zatrzymywanie i aktualizacja jednym kliknięciem.

Usługa Node.js bez zależności z jednostronicowym pulpitem. Monitoruje projekty, uruchamia i zatrzymuje je oraz pobiera aktualizacje — nigdy nie zmieniając ich kodu.

## Szybki start

```bash
node src/index.js
```

Otwórz: http://127.0.0.1:8780

Wymaga Node.js 20+. Windows w pełni obsługiwany; Linux/macOS korzystają z wbudowanej warstwy platformowej.

## Funkcje

- **Status na pierwszy rzut oka** — stan, porty, PID-y i czas działania, odświeżane co 3 s.
- **Uruchom / zatrzymaj / uruchom ponownie** — korzysta z własnego skryptu startowego projektu.
- **Aktualizacja jednym kliknięciem** — tymczasowo zapisuje niezacommitowane zmiany, aktualizuje i przywraca je; przy błędzie wycofuje.
- **Dowolny stack** — Next.js, FastAPI, binaria Go, Godot, pygame i usługi pip w jednej tabeli.
- **Dwujęzyczny interfejs i motyw jasny/ciemny** — przełączanie w nagłówku, zapamiętywane lokalnie.
- **Tylko launcher** — nigdy nie uruchamia git init ani nie zapisuje w zarządzanych projektach.

## Zarządzane projekty

| Projekt | Stack | Port | Aktualizacja |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | synchronizacja forka |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | ręcznie |
| wb2api-panel | Go | 7863 | ręcznie |
| REA | TypeScript / CLI | — | ręcznie |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | ręcznie |

## Bezpieczeństwo i izolacja

- Nasłuchuje tylko na 127.0.0.1, bez uwierzytelniania (lokalne narzędzie dla jednego użytkownika).
- Lokalna konfiguracja i logi są poza git; publikowany jest tylko przenośny przykład.
- Nigdy nie zapisuje w zarządzanych projektach; jedynym zapisem jest aktualizacja uruchomiona przez Ciebie.

## Dokumentacja

- [Projekt i architektura (po chińsku)](../design.md)
- [Szczegółowy README (po chińsku)](../README.full.zh-CN.md)
- `npm test` — 111 testów: parsowanie, walidacja konfiguracji, przepływy git i renderowanie pulpitu
