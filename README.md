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
| 更新 | `git pull --ff-only`；fork 项目同步上游；批量更新 |
| 落后提示 | 显示远程领先的提交数（`↓N`），有更新时按钮带计数 |
| 日志 | 每个项目独立日志，看板可展开查看最近 200 行 |
| 更新前置检查 | 脏工作区 / detached HEAD / 分支不匹配一律拒绝并说明原因 |

## 管理范围

| 项目 | 栈 | 端口 | 更新方式 |
|---|---|---|---|
| LibreTV | Next.js 15 | 8090 | fork 同步上游 |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python 代理 | 8790 | 手动（非 git 仓库） |
| wb2api-panel | Go 二进制 | 7863 | 手动（非 git 仓库） |
| REA | TS monorepo / CLI | — | 手动（非 git 仓库） |
| 2048 | pygame 桌面 | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |

## 目录结构

```
src/
├── index.js            入口：加载注册表、起服务、后台刷新 git 状态
├── server.js           HTTP 路由 + 静态看板
├── api/
│   ├── projects.js     状态聚合、生命周期、更新编排
│   └── scan.js         目录扫描（只给候选，不自动写入）
├── core/
│   ├── registry.js     registry.json 读写与校验
│   ├── netstat.js      端口 → PID 反查（停止能力的基石）
│   ├── probe.js        三级状态探测：TCP / 进程名 / PID
│   ├── process.js      子进程托管：启动、收日志、就绪判定、回收
│   ├── git.js          git 命令封装
│   └── update.js       更新逻辑与前置检查
└── util/
    ├── exec.js         execFile Promise 封装 + 行缓冲 spawn
    └── logger.js       管理器日志 + 每项目独立日志

public/index.html       单页看板（原生 JS，无构建步骤）
data/
├── registry.json       项目登记表（唯一需要手改的配置）
└── logs/               运行日志
```

## 配置：data/registry.json

这是唯一需要手改的文件。每个项目一条记录：

```jsonc
{
  "id": "libretv",                          // 唯一 id，小写字母/数字/连字符
  "name": "LibreTV",
  "path": "~/Desktop/LibreTV",
  "kind": "node-service",                   // node-service | python-service | go-binary | cli-tool | desktop-app | observe-only
  "start": {
    "command": "cmd.exe",
    "args": ["/c", "start-libretv.cmd"],     // 复用项目自带脚本
    "detached": true
  },
  "stop": { "strategy": "port", "port": 8090 },
                                              // port（反查 PID）| procname（按镜像名）| command（项目自带停止脚本）| none
  "url": "http://127.0.0.1:8090",
  "port": 8090,
  "startupTimeoutMs": 300000,                // 含首次 build，给足时间
  "startupMatch": "Ready in|Local:",         // 日志出现此正则即视为就绪（可选）
  "update": { "strategy": "git-fork", "remote": "origin", "branch": "main", "upstream": "upstream" }
                                              // git | git-fork | none
}
```

改完重启管理器生效。配置写错会在启动时报出**具体是哪个项目的哪个字段**，不会静默失败。

### 关键约定

- **端口 8780 是管理器自己的**，被管项目不能占用（注册表会校验并拒绝）
- **两个项目不能占同一端口**（会校验）
- **`start.command: null`** 表示不可启动，仅 `cli-tool` 和 `observe-only` 两种 kind 允许

## 设计要点

### 为什么复用项目自带启动脚本

每个项目的脚本都已经处理了自己的坑：LibreTV 会检查 `.next/BUILD_ID` 缺了就 build，githubPopularProjects 首次自动 `npm install` 且生产失败回退 dev，qoder 有四级 Python 探测兜底。绕过脚本就要把这些全部重实现一遍且必然腐化。管理器只管调用和看结果。

### 为什么停止靠端口反查而非 PID

`cmd.exe /c` 会立刻退出，真正干活的是孙进程，管理器拿不到真实 PID。所以停止时用 `netstat -ano` 反查 LISTENING 行的 PID——这对"非管理器启动的服务"同样有效。

解析逻辑有测试覆盖，特别是 `:8090` 不能误匹配 `:80901` / `:18090` 这个边界。

### 为什么更新只允许 fast-forward

`--ff-only` 保证本地有未推送提交时**明确失败并报告**，而不是悄悄生成一个 merge commit。冲突立即 `--abort`，不留半合并状态。详见 `test/git.test.js` 里标注的三条铁律。

### 强杀的风险与缓解

`taskkill /F` 不给程序清理机会，对会写状态文件的项目（qoder 的 `accounts/`、wb2api 的 `data/state.json`）有损坏风险。所以停止时**先软杀等最多 3 秒，仍在才强杀**。

## 测试

```bash
node --test "test/*.test.js"
```

65 个测试，覆盖：
- `netstat.test.js` — 端口解析的边界情况（前缀误匹配、IPv4/IPv6 去重、非 LISTENING 状态）
- `registry.test.js` — 配置校验（该拒的拒得掉、该放的放得过）
- `git.test.js` — 真实 git 仓库操作，验证 fast-forward / 脏工作区 / 冲突 abort 三条铁律
- `dashboard.test.js` — 看板渲染逻辑与 XSS 转义（最小 DOM 模拟，无需浏览器）

**wb2api-panel 暂不纳入测试**（按需求约定，项目开发完毕后再纳入）。

## 开机自启（可选）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1
```

注册登录时自动启动的计划任务。管理器只提供看板和启停入口，**不会自动启动被管项目**。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 全量状态（看板轮询用） |
| GET | `/api/projects/:id` | 单个项目详情 |
| GET | `/api/projects/:id/logs?lines=200` | 最近 N 行日志 |
| POST | `/api/projects/:id/start` | 启动 |
| POST | `/api/projects/:id/stop` | 停止 |
| POST | `/api/projects/:id/restart` | 重启 |
| POST | `/api/projects/:id/update` | 更新 |
| POST | `/api/update-all` | 批量更新 |
| POST | `/api/scan` | 目录扫描 |
| GET | `/api/health` | 管理器健康 |

## 已知限制

- **LibreTV / Grimoire-Echoes 工作区脏**（未跟踪的 `start-libretv.cmd`、`tools/`、`game/.godot/editor/*.cfg`），更新会被前置检查拒绝。需先提交、stash，或自行决定是否补 `.gitignore`。
- **三个非 git 项目无法更新**：qoder2api-hub、wb2api-panel、REA。它们含凭据或状态目录，方案不自动 `git init`——由你自行决定是否纳入 git。
- **启动耗时**：Next.js 项目首次启动可能需数分钟（含编译），`startupTimeoutMs` 已设为 300 秒。
- **Windows only**：停止依赖 `netstat` / `tasklist` / `taskkill`，探测依赖这些命令的输出格式。

## 完整设计

[docs/design.md](docs/design.md)
