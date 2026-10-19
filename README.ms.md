# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · **Bahasa Melayu** · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Pelancar setempat untuk semua projek GitHub anda: status, mula/henti dan kemas kini sekali klik.

Perkhidmatan Node.js tanpa kebergantungan dengan papan pemuka satu halaman. Memantau projek anda, memulakan dan menghentikannya, serta menarik kemas kini — tanpa pernah mengubah kodnya.

## Mula pantas

```bash
node src/index.js
```

Buka: http://127.0.0.1:8780

Memerlukan Node.js 20+. Windows disokong sepenuhnya; Linux/macOS menggunakan lapisan platform terbina dalam.

## Ciri

- **Status sekilas pandang** — status berjalan, port, PID dan masa aktif, dikemas kini setiap 3 saat.
- **Mula / henti / mula semula** — menggunakan skrip mula setiap projek.
- **Kemas kini sekali klik** — menyimpan sementara perubahan yang belum di-commit, mengemas kini dan memulihkannya; jika gagal, rollback.
- **Sebarang stack** — Next.js, FastAPI, binari Go, Godot, pygame dan perkhidmatan pip dalam satu jadual.
- **UI dwibahasa dan tema cerah/gelap** — tukar dari pengepala, diingati secara setempat.
- **Hanya pelancar** — tidak pernah menjalankan git init atau menulis ke projek yang diurus.

## Projek yang diurus

| Projek | Stack | Port | Kemas kini |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | penyegerakan fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manual |
| wb2api-panel | Go | 7863 | manual |
| REA | TypeScript / CLI | — | manual |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manual |

## Keselamatan dan pengasingan

- Hanya mendengar pada 127.0.0.1, tanpa pengesahan (alat setempat satu pengguna).
- Konfigurasi dan log setempat dikecualikan daripada git; hanya contoh mudah alih diterbitkan.
- Tidak pernah menulis ke projek yang diurus; satu-satunya penulisan ialah kemas kini yang anda picu.

## Dokumentasi

- [Reka bentuk dan seni bina (Cina)](docs/design.md)
- [README terperinci (Cina)](docs/README.full.zh-CN.md)
- `npm test` — 111 ujian: penghuraian, pengesahan konfigurasi, aliran git dan pemaparan papan pemuka
