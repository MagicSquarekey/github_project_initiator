# github_project_initiator

Desktop 上散落的 GitHub 项目，需要一个统一的地方：看得见状态、点得动启停、一键更新。

本仓库就是这个"地方"——一个本地常驻的管理服务 + 单页看板，把 8 个异构项目（Next.js / FastAPI / Python 代理 / Go 二进制 / Godot / pygame）纳入同一张表管理。

## 文档

- [docs/design.md](docs/design.md) — 完整设计方案（架构、数据模型、API、实施计划）

## 快速开始

> 尚未实现。设计定稿后按 `docs/design.md` 的第 9 节分期落地。

```bash
# 预期用法（Phase 1 完成后）
node src/index.js            # 启动管理服务，默认 http://127.0.0.1:8780
```

## 管理范围

| 项目 | 栈 | 端口 | 说明 |
|---|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork，需跟踪上游 |
| githubPopularProjects | Next.js 15 | 3000 | 自有 |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | 双服务 |
| qoder2api-hub | Python 代理 | 8790 | 非 git 仓库 |
| wb2api-panel | Go 二进制 | 7863 | 非 git 仓库 |
| REA | TS monorepo | — | 非 git 仓库，CLI/MCP |
| 2048 | pygame 桌面 | — | 无端口 |
| Grimoire-Echoes | Godot 4 | — | 无端口 |
