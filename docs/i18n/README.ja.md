# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> すべての GitHub プロジェクトを 1 か所で管理するローカルランチャー。状態確認・起動/停止・ワンクリック更新。

依存関係ゼロの Node.js サービスとシングルページダッシュボード。マシン上のプロジェクトを監視し、起動・停止・更新を行い、プロジェクト自体には一切変更を加えません。

## クイックスタート

```bash
node src/index.js
```

開く: http://127.0.0.1:8780

Node.js 20+ が必要です。Windows は完全対応、Linux/macOS は内蔵プラットフォーム層を利用します。

## 機能

- **状態を一覧** — 実行状態・ポート・PID・稼働時間を 3 秒ごとに更新。
- **起動 / 停止 / 再起動** — 各プロジェクトの起動スクリプトをそのまま利用します。
- **ワンクリック更新** — 未コミットの変更を自動 stash し、更新後に復元。失敗時はロールバック。
- **あらゆるスタック** — Next.js、FastAPI、Go バイナリ、Godot、pygame、pip サービスを同じ表で。
- **中英バイリンガル + ライト/ダーク** — ヘッダーで切替、設定はローカル保存。
- **ランチャー専用** — 管理対象で git init やファイル書き込み、構造変更は行いません。

## 管理対象

| プロジェクト | スタック | ポート | 更新 |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | フォーク同期 |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | 手動 |
| wb2api-panel | Go | 7863 | 手動 |
| REA | TypeScript / CLI | — | 手動 |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | 手動 |

## セキュリティと分離

- 127.0.0.1 のみで待ち受け、認証なし（単一ユーザー向けローカルツール）。
- ローカル設定とログは git 管理外。公開されるのは可搬なサンプルのみ。
- 管理対象には書き込みません。書き込みは明示的な更新操作のみ。

## ドキュメント

- [設計とアーキテクチャ（中国語）](../design.md)
- [詳細な説明（中国語）](../README.full.zh-CN.md)
- `npm test` — 111 件のテスト：パース、設定検証、git フロー、ダッシュボード描画
