# github_project_initiator

Desktop 上散落的 GitHub 项目，一个统一入口：看得见状态、点得动启停、一键更新。

一个本地常驻的 Node 服务 + 单页看板，把 9 个异构项目（Next.js / FastAPI / Python 代理 / Go 二进制 / Godot / pygame / 常驻记忆服务）纳入同一张表管理。**零第三方依赖**。

## 快速开始

```bash
node src/index.js
```

然后打开 http://127.0.0.1:8780

## 功能

| 能力 | 说明 |
|---|---|
| 状态总览 | 每 3 秒刷新，显示运行状态、端口、PID、运行时长 |
| 启动 / 停止 / 重启 | 复用项目自带启动脚本，保留各项目原有的环境处理逻辑 |
| **一键更新** | 工作区有未提交改动也无需手动处理——自动 stash、更新、恢复 |
| 批量更新 | 顺序执行，逐个回显结果 |
| **看板内添加项目** | 选目录 → 自动识别启动命令/端口 → 确认写入，无需手改 JSON；支持移除 |
| 落后提示 | 显示远程领先的提交数（`↓N`），有更新时按钮带计数 |
| 中英文切换 | 顶栏语言按钮，选择记住在本地 |
| 明暗主题 | 顶栏主题按钮，选择记住在本地 |
| 日志 | 每个项目独立日志，看板可全屏查看最近 500 行；时间戳为北京时间（带 +08:00 偏移） |

> **启动器边界**：本工具对被管项目只做三件事——看状态、启停、按你的指令拉更新。
> 绝不改动项目本身：不在项目目录里 `git init`、不新增文件、不改配置。非 git 仓库一律手动更新。

## 版本：Windows / 跨平台

同一份代码，平台相关操作收敛在 `src/core/platform.js`：

| 能力 | Windows | Linux | macOS |
|---|---|---|---|
| 端口 → PID | `netstat -ano` | `ss -ltnp`（退回 `lsof`） | `lsof -iTCP:PORT` |
| 进程名 → PID | `tasklist /fo csv` | `ps -Ao pid=,comm=` | 同 Linux |
| 结束进程 | `taskkill`（软杀 → 强杀） | `kill -15` → `kill -9` | 同 Linux |
| 启动脚本 | `cmd.exe /c xxx.bat` | `bash xxx.sh` | 同 Linux |

上层业务代码不感知平台。启动脚本按平台自动选择 `.bat` / `.sh`（`wrapScript`）。

> 注意：`data/registry.json` 里各项目的启动命令当前按 Windows 编写。在 Linux/macOS 上需把 `start.command` 改成 `bash`、脚本名换成对应的 `.sh`（多数项目已自带 `.sh` 版本）。

## 管理范围

| 项目 | 栈 | 端口 | 更新方式 |
|---|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork 同步上游 |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python 代理 | 8790 | 手动（非 git 仓库） |
| wb2api-panel | Go 二进制 | 7863 | 手动（暂不纳入测试） |
| REA | TS monorepo / CLI | — | 手动（目录现为 git 仓库，确认后可改为 git） |
| 2048 | pygame 桌面 | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python 常驻服务 | 1933 | 手动（pip 安装，非 git） |

共 9 个条目。AutoTestHub 是单条目——`start.vbs` 一次调用同时拉起 backend(8686) 与 frontend(5173)，停止同时回收两个端口；卡片上会逐个显示子服务就绪状态。

## 添加监测项目

不用手写 `registry.json`：

1. 点顶栏「添加项目」；
2. 点「浏览…」选目录，或直接输入路径（支持 `~`）；
3. 点「扫描目录」可列出该目录（留空则桌面）下尚未纳管的项目；
4. 管理器自动识别：项目自带启动脚本、`package.json` 的 start/dev、同名 exe、jar、Python 入口、`.env`/config 里的端口、是否 git 仓库；
5. 核对/修改表单（名称、端口、启动命令、停止方式、更新方式），点「添加」。

识别结果只是建议：只在空字段里预填，不覆盖已输入内容，也不会自动保存。
添加时仍走完整校验（目录存在、id 唯一、端口不冲突、start/stop/update 结构），失败会逐条列出原因。

卡片上的「移除」只删除看板条目，**不会删除项目文件**；管理器自身不能移除。

## 一键更新是如何保证不丢改动的

从 GitHub 下载的项目几乎都带未提交改动（编辑器配置、本地脚本、构建产物），
一律拒绝更新会让"点一下"变成不可能。流程：

```
检查（remote / 分支 / detached HEAD）
   ↓ 全部通过才继续
工作区脏？──否──→ 直接更新
   ↓ 是
git stash push --include-untracked     ← 连未跟踪文件一起保护
   ↓
更新（pull --ff-only / fork 合并 / 上游对齐）
   ↓
成功 → git stash pop（恢复改动）
失败 → git stash pop（回滚到更新前）
```

两条硬约束（有测试锁定）：

1. **所有可能在 stash 之前失败的检查都排在 stash 之前**，任何提前 return 都不留 stash。
2. **用 `try/finally` 兜住所有异常路径**，且用 `stashConsumed` 标志防止误弹用户自己的 stash。

`--include-untracked` 很关键：最常见的未提交改动就是新增的未跟踪文件，不含它这些文件会挡住更新。

## 目录结构

```
src/
├── index.js            入口：加载注册表、起服务、后台刷新 git 状态
├── server.js           HTTP 路由 + 静态看板
├── api/
│   ├── projects.js     状态聚合、生命周期、更新编排
│   └── scan.js         目录扫描（只给候选，不自动写入）
├── core/
│   ├── platform.js     ★ 平台适配层（netstat/ss/lsof、taskkill/kill）
│   ├── netstat.js      端口查询（platform 的兼容包装）
│   ├── registry.js     registry.json 读写与校验
│   ├── probe.js        三级状态探测：TCP / 进程名 / PID
│   ├── process.js      子进程托管：启动、收日志、就绪判定、回收
│   ├── git.js          git 命令封装
│   └── update.js       更新逻辑与前置检查
└── util/
    ├── exec.js         execFile Promise 封装 + 行缓冲 spawn
    └── logger.js       管理器日志 + 每项目独立日志

public/index.html       单页看板（原生 JS + i18n + 明暗主题，无构建步骤）
scripts/
├── check-secrets.mjs   开源前敏感信息扫描（npm run check）
├── test.mjs            跨平台测试入口（npm test）
└── install-startup.ps1 开机自启（可选）
data/
├── registry.example.json  可移植模板（入库）
├── registry.json          本机真实配置（不入库，含绝对路径）
└── logs/                  运行日志（不入库）
```

## 配置：data/registry.json

首次运行会自动创建空的 `data/registry.json`，打开看板点「添加项目」即可录入自己的项目；也可以手动编辑。路径支持 `~/...` 与 `${ENV}/...`。`data/registry.example.json` 是可移植的格式参考。

```jsonc
{
  "id": "libretv",
  "name": "LibreTV",
  "path": "~/Desktop/LibreTV",
  "kind": "node-service",
  "start": { "command": "cmd.exe", "args": ["/c", "start-libretv.cmd"], "detached": true },
  "stop": { "strategy": "port", "port": 8090 },
  "url": "http://127.0.0.1:8090",
  "port": 8090,
  "startupTimeoutMs": 300000,
  "startupMatch": "Ready in|Local:",
  "update": {
    "strategy": "git-fork",              // git | git-fork | none
    "remote": "origin",
    "branch": "main",
    "upstream": "upstream"
  }
}
```

配置写错会在启动时报出**具体是哪个项目的哪个字段**，不会静默失败。

### 关键约定

- 端口 8780 是管理器自己的，被管项目不能占用（注册表校验并拒绝）
- 两个项目不能占同一端口（会校验）
- `start.command: null` 表示不可启动，仅 `cli-tool` 和 `observe-only` 两种 kind 允许

## 数据与安全隔离

这个仓库要公开，而管理器必须知道本机路径。两者靠"配置分层"隔开：

| 内容 | 是否入库 | 说明 |
|---|---|---|
| `data/registry.example.json` | ✅ 入库 | 可移植模板，路径用 `~/Desktop/...` |
| `data/registry.json` | ❌ 不入库 | 你本机的真实配置，含绝对路径（用户名、目录布局） |
| `data/logs/` | ❌ 不入库 | 运行日志；可能包含被管项目打印的内容（如首次启动的密钥） |
| `data/state.json` | ❌ 不入库 | 运行期状态 |
| `.env` / `*.pem` / `*.key` | ❌ 不入库 | 即使误建也不会被提交 |

首次运行若没有 `data/registry.json`，会自动创建空注册表（不会复制示例项目）。

配置里支持两种可移植写法，运行时自动展开：

```jsonc
"path": "~/Desktop/LibreTV"
"path": "${PROJECTS_ROOT}/LibreTV"
```

### 边界与隔离

- **只监听 `127.0.0.1:8780`**，不暴露到局域网；API 无鉴权（单机单人使用）。
- **不向被管项目写入任何内容**——不 `git init`、不新增文件、不改配置。唯一的写操作是你点击的更新（`git pull`）与启停。
- 日志只写本项目的 `data/logs/`，不落到被管项目目录。
- 看板的"日志"面板读取的是上述本地日志，**不要把它截图或分享出去**——里面可能含有被管项目自己的敏感输出。

### 发布前检查

```bash
npm run check
```

扫描所有 git 跟踪文件，发现个人绝对路径或疑似凭据（API Key、私钥、密钥赋值）即失败。建议在提交前或 CI 里跑一次。

> **历史提示**：本仓库早期提交中曾包含带本机路径的 `data/registry.json`。目前未配置远程、从未推送，因此没有公开暴露。若在公开前想彻底清除历史痕迹，可在推送前重写历史（例如 `git filter-branch` 或直接新建仓库导入当前工作区）。

## 测试

```bash
npm test
```

190 项，覆盖：

- `netstat.test.js` — 端口解析边界（前缀误匹配、IPv4/IPv6 去重、非 LISTENING）
- `platform.test.js` — 三个平台的输出格式解析一致性
- `registry.test.js` — 配置校验、可移植路径展开、示例配置不含个人路径
- `git.test.js` — 真实 git 仓库：fast-forward、自动 stash 与回滚、冲突 abort
- `dashboard.test.js` — 看板渲染逻辑、XSS 转义、i18n 键对齐、主题变量、添加表单
- `manage.test.js` — 项目纳管：默认值、id 避让、目录/端口/名称冲突、写盘与移除
- `scan.test.js` — 启动脚本 / npm scripts / 端口识别、扫描跳过规则、目录浏览
- `server.test.js` — 添加/识别/浏览/移除的真实 HTTP 流程、CORS 来源限制
- `startable.test.js` — 启动脚本存在性预检（PATH 命令不被误判）
- `logger.test.js` — 北京时间格式与历史 UTC 日志转换

wb2api-panel 已纳入启停测试范围（2026-10-19 实机验证通过）。

## 开机自启（可选）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1
```

注册的是**当前用户 HKCU Run 键**（登录时触发），不需要管理员权限；实际启动由
`scripts/start-manager-hidden.vbs` 完成，全程无窗口。计划任务（`Register-ScheduledTask`）
在普通用户下会被系统拒绝（拒绝访问），所以没有采用。

卸载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1 -Uninstall
```

管理器只提供看板和启停入口，**不会自动启动被管项目**。

## 已知限制

- LibreTV / Grimoire-Echoes 的本地未跟踪文件现在不再挡住更新（自动 stash），但**仍会显示为"有改动"**
- wb2api-panel 为二进制分发、非 git 仓库，更新为手动；如需一键更新，自行 `git clone` 上游后把策略改为 `git`
- 启动耗时：Next.js 项目首次启动可能需数分钟（含编译），超时已设为 300 秒
- 跨平台运行时，`registry.json` 里的启动命令需按平台调整（`.bat` ↔ `.sh`）
- 添加项目时的自动识别是启发式：端口/启动命令可能猜错，请在提交前核对；识别不到时手填即可

## 完整设计

[docs/design.md](design.md)
