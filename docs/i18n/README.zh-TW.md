# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> 一個本機啟動器，統一管理你的 GitHub 專案：看狀態、啟停、一鍵更新。

零依賴的 Node.js 服務 + 單頁看板。監控本機專案、啟動停止、拉取更新，全程不改動專案本身。

## 快速開始

```bash
node src/index.js
```

開啟: http://127.0.0.1:8780

需要 Node.js 20+。Windows 完整支援；Linux/macOS 使用內建平台適配層。

## 功能

- **狀態一覽** — 即時執行狀態、連接埠、PID 與執行時間，每 3 秒更新。
- **啟動 / 停止 / 重新啟動** — 沿用專案自帶的啟動腳本，保留其原有的環境處理邏輯。
- **一鍵更新** — 自動暫存未提交的變更，拉取後還原；失敗則回滾。
- **任意技術棧** — Next.js、FastAPI、Go 執行檔、Godot、pygame 與 pip 服務同表管理。
- **看板內新增專案** — 選擇專案目錄即可自動辨識啟動命令與連接埠，無需手動修改 JSON。
- **中英雙語 + 明暗主題** — 頂欄切換，偏好本機記住。
- **只做啟動器** — 絕不在被管專案裡 git init、寫入檔案或改變結構。

## 管理範圍

| 專案 | 技術棧 | 連接埠 | 更新 |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork 同步 |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | 手動 |
| wb2api-panel | Go | 7863 | 手動 |
| REA | TypeScript / CLI | — | 手動 |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | 手動 |

## 安全與隔離

- 僅監聽 127.0.0.1，無驗證（單機單人工具）。
- 本機設定與日誌已被 git 忽略，倉庫只發布可攜範例。
- 不向被管專案寫入任何內容——唯一的寫入操作是你主動觸發的更新。

## 文件

- [設計與架構（中文）](../design.md)
- [詳細中文說明](../README.full.zh-CN.md)
- `npm test` — 190 項測試：解析、設定驗證、git 流程、看板渲染
