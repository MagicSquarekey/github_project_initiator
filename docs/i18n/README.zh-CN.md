# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> 一个本地启动器，统一管理你的 GitHub 项目：看状态、启停、一键更新。

零依赖的 Node.js 服务 + 单页看板。监控本机项目、启动停止、拉取更新，全程不改动项目本身。

## 快速开始

```bash
node src/index.js
```

打开: http://127.0.0.1:8780

需要 Node.js 20+。Windows 完整支持；Linux/macOS 使用内置平台适配层。

## 功能

- **状态一览** — 实时运行状态、端口、PID 与运行时长，每 3 秒刷新。
- **启动 / 停止 / 重启** — 复用项目自带的启动脚本，保留其原有的环境处理逻辑。
- **一键更新** — 自动暂存未提交改动，拉取后恢复；失败则回滚。
- **任意技术栈** — Next.js、FastAPI、Go 二进制、Godot、pygame 与 pip 服务同表管理。
- **中英双语 + 明暗主题** — 顶栏切换，偏好本地记住。
- **只做启动器** — 绝不在被管项目里 git init、写入文件或改变结构。

## 管理范围

| 项目 | 技术栈 | 端口 | 更新 |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork 同步 |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | 手动 |
| wb2api-panel | Go | 7863 | 手动 |
| REA | TypeScript / CLI | — | 手动 |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | 手动 |

## 安全与隔离

- 仅监听 127.0.0.1，无鉴权（单机单人工具）。
- 本机配置与日志已被 git 忽略，仓库只发布可移植示例。
- 不向被管项目写入任何内容——唯一的写操作是你主动触发的更新。

## 文档

- [设计与架构（中文）](../design.md)
- [详细中文说明](../README.full.zh-CN.md)
- `npm test` — 111 项测试：解析、配置校验、git 流程、看板渲染
