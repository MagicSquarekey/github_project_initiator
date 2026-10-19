# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · **Bahasa Indonesia** · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Peluncur lokal untuk semua proyek GitHub Anda: status, mulai/hentikan, dan pembaruan sekali klik.

Layanan Node.js tanpa dependensi dengan dasbor satu halaman. Memantau proyek Anda, menyalakan dan mematikannya, serta menarik pembaruan — tanpa pernah mengubah kodenya.

## Mulai cepat

```bash
node src/index.js
```

Buka: http://127.0.0.1:8780

Memerlukan Node.js 20+. Windows didukung penuh; Linux/macOS memakai lapisan platform bawaan.

## Fitur

- **Status sekilas** — status berjalan, port, PID, dan waktu aktif, diperbarui tiap 3 detik.
- **Mulai / hentikan / mulai ulang** — memakai skrip mulai milik tiap proyek.
- **Pembaruan sekali klik** — menyimpan sementara perubahan yang belum di-commit, memperbarui, lalu memulihkannya; gagal berarti rollback.
- **Semua stack** — Next.js, FastAPI, biner Go, Godot, pygame, dan layanan pip dalam satu tabel.
- **UI dua bahasa dan tema terang/gelap** — beralih dari header, diingat secara lokal.
- **Hanya peluncur** — tidak pernah menjalankan git init atau menulis ke proyek yang dikelola.

## Proyek yang dikelola

| Proyek | Stack | Port | Pembaruan |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | sinkronisasi fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manual |
| wb2api-panel | Go | 7863 | manual |
| REA | TypeScript / CLI | — | manual |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manual |

## Keamanan dan isolasi

- Hanya mendengarkan di 127.0.0.1, tanpa autentikasi (alat lokal satu pengguna).
- Konfigurasi dan log lokal dikecualikan dari git; hanya contoh portabel yang dipublikasikan.
- Tidak pernah menulis ke proyek yang dikelola; satu-satunya penulisan adalah pembaruan yang Anda picu.

## Dokumentasi

- [Desain dan arsitektur (Tionghoa)](docs/design.md)
- [README terperinci (Tionghoa)](docs/README.full.zh-CN.md)
- `npm test` — 111 pengujian: parsing, validasi konfigurasi, alur git, dan rendering dasbor
