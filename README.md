# github_project_initiator

Desktop 上散落的 GitHub 项目，一个统一入口：看得见状态、点得动启停、一键更新。

一个本地常驻的 Node 服务 + 单页看板，把 8 个异构项目（Next.js / FastAPI / Python 代理 / Go 二进制 / Godot / pygame）纳入同一张表管理。**零第三方依赖**。

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
| **GitHub 下载项目** | zip 解压得到的非 git 目录也能更新（`git-clone` 策略，首次自动建库关联上游） |
| 批量更新 | 顺序执行，逐个回显结果 |
| 落后提示 | 显示远程领先的提交数（`↓N`），有更新时按钮带计数 |
| 中英文切换 | 顶栏语言按钮，选择记住在本地 |
| 明暗主题 | 顶栏主题按钮，选择记住在本地 |
| 日志 | 每个项目独立日志，看板可全屏查看最近 500 行；时间戳为北京时间（带 +08:00 偏移） |

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
| qoder2api-hub | Python 代理 | 8790 | git-clone（原 zip 解压） |
| wb2api-panel | Go 二进制 | 7863 | 手动（暂不纳入测试） |
| REA | TS monorepo / CLI | — | git-clone（原 zip 解压） |
| 2048 | pygame 桌面 | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |

共 8 个条目。AutoTestHub 是单条目——`start.vbs` 一次调用同时拉起 backend(8686) 与 frontend(5173)，停止同时回收两个端口；卡片上会逐个显示子服务就绪状态。

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

### git-clone：zip 解压项目的更新

本地不是 git 仓库但有上游地址时：

1. 建一个**空**仓库（刻意不提交本地文件——否则它们变成已跟踪状态，会被 `reset --hard` 清掉）
2. 配置 remote 指向上游
3. 对齐到上游（空仓库分支是 unborn 的，没有 `origin/<branch>` 引用，自动退到 `FETCH_HEAD`）
4. 本地未跟踪文件原样保留，之后就走正常的 `ff-only` 流程

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
data/
├── registry.json       项目登记表（唯一需要手改的配置）
└── logs/               运行日志
```

## 配置：data/registry.json

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
    "strategy": "git-fork",              // git | git-fork | git-clone | none
    "remote": "origin",
    "branch": "main",
    "upstream": "upstream",
    "repoUrl": "https://github.com/xxx/yyy.git"   // 仅 git-clone 需要
  }
}
```

配置写错会在启动时报出**具体是哪个项目的哪个字段**，不会静默失败。

### 关键约定

- 端口 8780 是管理器自己的，被管项目不能占用（注册表校验并拒绝）
- 两个项目不能占同一端口（会校验）
- `start.command: null` 表示不可启动，仅 `cli-tool` 和 `observe-only` 两种 kind 允许

## 测试

```bash
node --test "test/*.test.js"
```

92 项，覆盖：

- `netstat.test.js` — 端口解析边界（前缀误匹配、IPv4/IPv6 去重、非 LISTENING）
- `platform.test.js` — 三个平台的输出格式解析一致性
- `registry.test.js` — 配置校验
- `git.test.js` — 真实 git 仓库：fast-forward、自动 stash 与回滚、冲突 abort、git-clone
- `dashboard.test.js` — 看板渲染逻辑、XSS 转义、i18n 键对齐、主题变量

**wb2api-panel 暂不纳入测试**（按项目约定，最终完成后再纳入）。

## 开机自启（可选）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1
```

管理器只提供看板和启停入口，**不会自动启动被管项目**。

## 已知限制

- LibreTV / Grimoire-Echoes 的本地未跟踪文件现在不再挡住更新（自动 stash），但**仍会显示为"有改动"**
- wb2api-panel 更新策略为 `none`，待测试通过后可配 `git-clone`
- 启动耗时：Next.js 项目首次启动可能需数分钟（含编译），超时已设为 300 秒
- 跨平台运行时，`registry.json` 里的启动命令需按平台调整（`.bat` ↔ `.sh`）

## 完整设计

[docs/design.md](docs/design.md)
