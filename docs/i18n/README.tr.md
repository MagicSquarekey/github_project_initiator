# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · **Türkçe** · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Tüm GitHub projeleriniz için tek bir yerel başlatıcı: durum, başlat/durdur ve tek tıkla güncelleme.

Bağımlılığı olmayan Node.js servisi ve tek sayfalık panel. Projelerinizi izler, başlatıp durdurur ve güncellemeleri çeker — kodlarına asla dokunmadan.

## Hızlı başlangıç

```bash
node src/index.js
```

Aç: http://127.0.0.1:8780

Node.js 20+ gerekir. Windows tam desteklenir; Linux/macOS yerleşik platform katmanını kullanır.

## Özellikler

- **Bir bakışta durum** — çalışma durumu, portlar, PID ve çalışma süresi, her 3 saniyede yenilenir.
- **Başlat / durdur / yeniden başlat** — her projenin kendi başlatma betiğini kullanır.
- **Tek tıkla güncelleme** — işlenmemiş değişiklikleri geçici olarak saklar, günceller ve geri yükler; hata olursa geri alır.
- **Her stack** — Next.js, FastAPI, Go ikili dosyaları, Godot, pygame ve pip servisleri tek tabloda.
- **Panodan proje ekleme** — klasörü seçin; başlatma komutu ve port otomatik algılanır, JSON düzenlemeye gerek yok.
- **İki dilli arayüz ve açık/koyu tema** — üst çubuktan değiştirilir, yerelde saklanır.
- **Yalnızca başlatıcı** — yönetilen projelerde asla git init çalıştırmaz ve yazmaz.

## Yönetilen projeler

| Proje | Stack | Port | Güncelleme |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork senkronizasyonu |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manuel |
| wb2api-panel | Go | 7863 | manuel |
| REA | TypeScript / CLI | — | manuel |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manuel |

## Güvenlik ve yalıtım

- Yalnızca 127.0.0.1 üzerinde dinler, kimlik doğrulama yok (tek kullanıcılı yerel araç).
- Yerel yapılandırma ve günlükler git dışında tutulur; yalnızca taşınabilir bir örnek yayınlanır.
- Yönetilen projelere asla yazmaz; tek yazma işlemi sizin başlattığınız güncellemedir.

## Belgeler

- [Tasarım ve mimari (Çince)](../design.md)
- [Ayrıntılı README (Çince)](../README.full.zh-CN.md)
- `npm test` — 190 test: ayrıştırma, yapılandırma doğrulama, git akışları ve panel oluşturma
