# github_project_initiator 设计方案

> 目标：在本地提供一个统一入口，管理 Desktop 下的 GitHub 项目——查看状态、启动/停止、批量更新。
>
> 本文是设计定稿。第 9 节是分期实施计划。

---

## 1. 问题定义与边界

### 1.1 现状痛点

桌面散落 8 个项目，启动方式各不相同：

- `LibreTV` → `start-libretv.cmd`（内部还会判断有没有 `.next/BUILD_ID`，没有就先 build）
- `githubPopularProjects` → `start.bat`（内部首次跑会 `npm install`，生产模式失败还会回退 dev）
- `AutoTestHub` → `start.vbs`（无窗口启动，同时拉起 FastAPI 8686 + Vite 5173 两个服务）
- `qoder2api-hub` → `start-qoder-proxy.bat`（四级 Python 探测：项目自带 → PATH → py launcher → Codex 缓存）
- `wb2api-panel` → 裸 `wb2api.exe` + `config.json`
- `REA` → 无启动脚本，是 CLI/MCP 工具（`bin: rea`）
- `2048` → pygame 桌面程序
- `Grimoire-Echoes` → Godot 4 工程

结果是：想知道"哪个在跑"要挨个开窗口；想停一个要 `netstat | findstr` 找 PID 再 `taskkill`；想更新要挨个 `cd` + `git pull`；LibreTV 这种 fork 还得记得同步上游。

### 1.2 明确不做的（YAGNI）

| 不做 | 原因 |
|---|---|
| Docker 化 | 本机没装 Docker，方案必须在当前环境可用 |
| 远程/多机管理 | 需求是"本地统一管理"，单机足够 |
| 日志聚合平台 | 只需能看每个项目最近若干行日志，落盘即可 |
| CI/CD、部署流水线 | 这些项目本身就是产物，不需要再包一层 |
| 多用户/权限 | 单机单人 |
| 自动拉取代码后自动重启 | 更新是显式动作；自动重启会影响正在跑的服务 |
| 深度健康检查（探活业务接口） | 只做 TCP 端口探测，够用且不会误报 |

### 1.3 目标

1. **看得见**：一个页面列出所有项目，标注运行状态、端口、git 分支/落后提交数。
2. **点得动**：启动 / 停止 / 重启，不用记任何脚本路径和端口。
3. **更新得了**：批量或单个 `git pull`；fork 项目额外支持同步上游；非 git 项目标记为不可更新。
4. **不打扰**：管理服务自己常驻，不抢占被管项目的端口，不注入任何环境变量。

---

## 2. 总体架构

### 2.1 单进程 + 子进程托管

```
┌─────────────────────────────────────────────────────────┐
│  manager (Node.js 单进程, 端口 8780)                     │
│                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ HTTP API     │  │ 静态看板      │  │ 进程管理器  │  │
│  │ /api/*       │  │ public/       │  │ ProcessMgr   │  │
│  └──────┬───────┘  └───────────────┘  └──────┬───────┘  │
│         │                                    │          │
│         │         ┌──────────────────────────┤          │
│         │         │                          │          │
│         └─────────┼────── 每 3s 轮询 ────────┤          │
│                   │                          │          │
│  ┌────────────────▼──┐  ┌─────────────────▼──────────┐  │
│  │ 状态探测          │  │ 子进程 (spawn, detached)    │  │
│  │ · TCP connect     │  │                             │  │
│  │ · tasklist/PID    │  │  LibreTV      :8090         │  │
│  │ · git ls-remote   │  │  gpp          :3000         │  │
│  └───────────────────┘  │  AutoTestHub  :8686/:5173   │  │
│                         │  qoder2api    :8790         │  │
│  ┌───────────────────┐  │  wb2api       :7863         │  │
│  │ 存储              │  └─────────────────────────────┘  │
│  │ data/registry.json│                                   │
│  │ data/logs/*.log   │                                   │
│  └───────────────────┘                                   │
└─────────────────────────────────────────────────────────┘
```

**为什么是单进程 Node 服务，而不是装个现成的面板（如 Portainer/n8n）？**

- 被管对象是本机**桌面进程**，不是容器——Portainer 类工具管不了裸 exe 和 Godot。
- 需求本身很薄（8 个项目、几个动作），引入数据库 + 前端框架 + 鉴权是纯负担。
- 零依赖单文件服务，`node src/index.js` 就能跑，符合"统一管理"应有的轻量。

### 2.2 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 运行时 | Node.js 22+（本机 24.16.0 可用） | 桌面已有；`child_process` 托管子进程是强项 |
| HTTP 框架 | 内置 `node:http` | 零依赖，路由只有十来个 |
| 静态看板 | 原生 HTML + `fetch` 的单页 | 无构建步骤，改完刷新即生效 |
| 存储 | `data/registry.json` | 8 条记录，JSON 足够；避免引入 SQLite 依赖 |
| 日志 | 每个项目一个 `data/logs/<id>.log` | `spawn` 的 stdout/stderr 管道落盘 |
| 更新 | `git` CLI（已装 2.47.1） | 不自己实现 git 协议 |

**不用 TypeScript**：本机跑单文件服务，TS 的编译步骤换不来收益。若后续要长成正式项目再迁。

**不用 Electron/Tauri 桌面壳**：浏览器书签即可访问，省一层打包。

---

## 3. 核心概念：项目描述符

所有异构性收敛到一份配置里。管理服务只认这份配置，不关心背后是 Next 还是 Godot。

```jsonc
// data/registry.json
{
  "version": 1,
  "projects": [
    {
      "id": "libretv",
      "name": "LibreTV",
      "path": "~/Desktop/LibreTV",
      "enabled": true,

      // —— 运行描述 ——
      "kind": "node-service",        // 见 3.1 类型表
      "start": {
        "command": "cmd.exe",
        "args": ["/c", "start-libretv.cmd"],
        "cwd": "~/Desktop/LibreTV",
        "detached": true             // 脱离管理器，管理器退出不影响它
      },
      "stop": {
        "strategy": "port",           // port | pidfile | command | none
        "port": 8090
      },
      "url": "http://127.0.0.1:8090",
      "port": 8090,
      "startupTimeoutMs": 180000,     // 含首次 build，给足 3 分钟
      "startupMatch": "ready|Local:", // 日志出现此正则即认为就绪（可选）

      // —— 更新描述 ——
      "update": {
        "strategy": "git",            // git | git-fork | none
        "remote": "origin",
        "branch": "main",
        "upstream": "upstream"        // fork 时同步上游
      },

      // —— 运行时状态（由管理器维护，不手改）——
      "state": {
        "running": true,
        "pid": null,
        "startedAt": "2026-10-19T10:00:00.000Z",
        "lastError": null
      }
    }
  ]
}
```

### 3.1 kind 与启动方式对照

| kind | 项目 | start.command | 说明 |
|---|---|---|---|
| `node-service` | LibreTV, githubPopularProjects, AutoTestHub(frontend) | `cmd.exe /c <脚本>` | 复用项目自带脚本，保持行为一致 |
| `python-service` | qoder2api-hub, AutoTestHub(backend) | `cmd.exe /c <脚本>` | 同上，脚本内含 Python 探测逻辑 |
| `java-service` | Elasticsearch | `cmd.exe /c bin\elasticsearch.bat` | zip 发行版；端口 9200，停止走端口反查 |
| `go-binary` | wb2api-panel | 直接 `wb2api.exe` | 读同目录 `config.json` |
| `cli-tool` | REA | 无（仅记录信息） | 不常驻，无启停概念 |
| `desktop-app` | 2048, Grimoire-Echoes | `cmd.exe /c <脚本>` 或直达 exe | 启动即算"运行"，停止用进程名 |

### 3.2 为什么"复用项目自带脚本"而不是管理器自己拼命令

这是本方案最重要的一个决策。

每个项目的启动脚本都已经处理了自己的坑：
- LibreTV 的脚本会检查 `.next/BUILD_ID`，缺了就 `npm run build`
- githubPopularProjects 的脚本会检测 `node_modules`，首次自动 `npm install`，生产失败回退 dev
- qoder 的脚本有四级 Python 探测兜底
- AutoTestHub 的 vbs 会先清理旧进程再拉起双服务

如果管理器绕过脚本、自己执行 `npm start`，就要把这些逻辑全部重实现一遍——重复且必然腐化。**管理器只负责"调用脚本 + 看结果"，把语义留给项目自己。**

代价是：`detached` 启动后管理器拿不到子进程 PID（`cmd.exe /c` 会立刻退出）。所以停止策略不能依赖 PID，改用**端口反查**（见 4.2）。

### 3.3 管理器自身也是看板里的一个条目

看板不仅列出被管项目，也把管理器自己列进去（`id=manager`）。实现上它不是
`registry.json` 的一部分，而是 `loadRegistry()` 每次动态注入的合成条目：

| 字段 | 取值 | 原因 |
|---|---|---|
| `self` | `true` | 业务层据此识别自身条目 |
| `kind` | `observe-only` | 只观察，不启动、不停止 |
| `path` | 代码根目录 | 天然可移植，不需要写进用户配置 |
| `port` | 8780 | 唯一允许占用管理器端口的条目 |
| `stop` / `update` | `none` | 看板不能停止或更新自己 |

为什么这样设计：

- **不写进 registry.json**：那份文件含本机绝对路径、不入库；自身条目写进去既破坏可移植性，又可能被误删。
- **不落盘**：`saveRegistry()` 会剥离 `self: true` 的条目，避免 `loadRegistry()` 的结果被原样回写时把合成条目固化。
- **状态不做探测**：请求能到达 `/api/projects`，就说明进程活着，直接返回 `runningVia: 'self'` 和当前 PID；运行时长取自 `process.uptime()`。
- **动作明确拒绝**：停止自己等于看板立即消失，重启自己则先杀掉唯一能重新拉起自己的进程。API 返回可读的拒绝原因，看板也不渲染启停按钮；批量停止同样排除自身。
- **日志天然对齐**：`id=manager` 对应 `data/logs/manager.log`，日志按钮不需要特殊分支。
- **后台仍会 fetch**：自身 `update.strategy` 是 `none`（不能一键更新），但仍参与每 5 分钟的 `git fetch`，所以卡片上的落后提交数是新鲜的；升级方式仍是手动 `git pull` 后重启。

---

## 4. 状态探测：怎么知道"在不在跑"

### 4.1 三级探测，任一命中即算运行中

```
1. TCP 探测（首选）
   net.connect(port) → 成功 = 运行中
   适用于所有 HTTP 服务。对 0.0.0.0 和 127.0.0.1 都有效。

2. 进程名探测（兜底）
   tasklist /fi "IMAGENAME eq wb2api.exe"
   适用于无端口服务（桌面程序、CLI 工具）。

3. PID 存活（辅助）
   process.kill(pid, 0) → 不抛错 = 活着
   仅用于管理器自己 spawn 且拿到了 PID 的情况。
```

**不做 HTTP 探活**：探活要等首字节，慢且可能被路由 404 干扰。TCP 连上就说明端口被监听，对"启停"这个目的足够了。就绪判定交给日志匹配（`startupMatch`）或超时。

**第 0 级：管理器自身。** 请求能到达 API，就说明进程活着——不需要也不应该去 TCP 自连 8780。`probeProject()` 对 `self: true` 的条目直接返回 `runningVia: 'self'` 与 `process.pid`。

### 4.2 端口反查 PID（停止的核心）

Node 没有内置 API 查"谁占用了端口"。Windows 上有三条路：

| 方案 | 命令 | 评价 |
|---|---|---|
| `netstat -ano \| findstr :8090` | 解析第 5 列 PID | **采用**。无需额外依赖，输出格式稳定 |
| `Get-NetTCPConnection` (PowerShell) | 结构化 | 每次停服务都要起一个 PowerShell，慢 |
| `@nestjs/...` 之类 npm 包 | — | 为零依赖原则，不引 |

实现要点：
- 必须精确匹配 `:8090` 后紧跟空白或行尾，否则 `:8090` 会误匹配 `:80901`
- 同一个端口可能同时有 IPv4(`0.0.0.0`)和 IPv6(`[::]`)两条 LISTENING，PID 相同，去重
- `netstat` 输出受代码页影响，用 `chcp 437` 或解析时只取 ASCII 数字列

```js
async function pidsOnPort(port) {
  const { stdout } = await execFileAsync('netstat', ['-ano']);
  const re = new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, 'gmi');
  return [...new Set([...stdout.matchAll(re)].map(m => +m[1]))];
}
```

### 4.3 停止策略分级

| strategy | 动作 | 适用 |
|---|---|---|
| `port` | 反查 PID → `taskkill /F /PID` | LibreTV, gpp, qoder, wb2api |
| `port` (多端口) | 对每个端口反查，合并 PID 集合后一起杀 | AutoTestHub（8686 + 5173） |
| `procname` | `taskkill /F /IM <name>.exe` | 2048、Grimoire-Echoes 等桌面程序 |
| `command` | 执行项目自带停止脚本 | 有 `stop.bat` 的项目 |
| `none` | 仅置状态位 | REA 这类 CLI 工具 |

**`taskkill /F` 是强杀，不给清理机会。** 对会写状态文件的项目（qoder 的 `accounts/`、wb2api 的 `data/state.json`）有损坏风险。缓解：先发 `taskkill`（无 `/F`，等同 WM_CLOSE），等 3 秒仍在再 `/F`。见 9.1 的"已知取舍"。

---

## 5. 更新能力

### 5.1 三种更新策略

```
git      普通 pull。git fetch + git pull --ff-only，失败回显不强行 merge
git-fork  fork 同步。先 git fetch upstream，再 merge upstream/<branch>
none     标记不可更新，UI 置灰
```

**只允许 fast-forward**：`--ff-only` 保证本地有未推送提交时**明确失败并报告**，而不是悄悄生成一个 merge commit。用户看到冲突提示后自己决定，比自动 merge 安全。

### 5.2 落后提交数（"有没有更新"）

每个项目启动时 `git fetch` 一次，之后每 5 分钟刷新：

```bash
git rev-list --count HEAD..@{upstream}     # 落后几个提交
git rev-list --left-right --count HEAD...@{upstream}   # 左右分列
```

看板显示 `↓3` 表示远程领先 3 个提交，此时"更新"按钮可用。

### 5.3 fork 上游同步

LibreTV 的 remote 是 `LibreSpark/LibreTV`，本地有修改（`start-libretv.cmd`、`tools/` 未跟踪）。同步流程：

1. `git fetch upstream`
2. `git merge upstream/main --no-edit`
3. 冲突则中止（`git merge --abort`）并报告，**绝不自动解冲突**

未跟踪文件（`start-libretv.cmd`、`tools/`）不受 pull 影响，这点要让用户放心。

### 5.4 非 git 项目的处理

`qoder2api-hub`、`wb2api-panel`、`REA` 当前不是 git 仓库。

- **不自动 `git init`**：这三个目录里有凭据和状态文件（`auths/`、`accounts/`、`config.json`、`data/`），盲目 init + commit 有泄露风险。
- 管理器把它们标为 `update.strategy: none`，看板显示"手动更新"。
- 用户若想纳入管理，自行 `git init` 并配好 `.gitignore` 后，改 `registry.json` 即可，管理器无需改动。

> 这是个显式记录在案的取舍：方案不为"方便"而替用户决定要不要把这些目录变成仓库。

### 5.5 更新前置检查

执行 pull 前必须校验，任一不满足则拒绝：

- `git status --porcelain` 为空（有未提交改动 → 拒绝，提示先提交或 stash）
- 不在 detached HEAD
- 当前分支与 `registry.json` 里配置的 branch 一致

---

## 6. API 设计

 RESTful，全部返回 JSON。端口 `8780`（避开 8 个项目的所有端口）。

### 6.1 端点表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 项目列表 + 实时状态（看板轮询用） |
| GET | `/api/projects/:id` | 单个项目详情 |
| POST | `/api/projects/:id/start` | 启动 |
| POST | `/api/projects/:id/stop` | 停止 |
| POST | `/api/projects/:id/restart` | 重启（stop → 等端口释放 → start） |
| POST | `/api/projects/:id/update` | 更新（git pull / fork 同步） |
| GET | `/api/projects/:id/logs?lines=200` | 最近 N 行日志 |
| POST | `/api/update-all` | 批量更新（顺序执行，逐个回显） |
| POST | `/api/scan` | 扫描目录发现新项目（见 6.3） |
| GET | `/api/health` | 管理器自身健康 |

### 6.2 关键响应示例

`GET /api/projects`：

```json
{
  "projects": [
    {
      "id": "libretv",
      "name": "LibreTV",
      "kind": "node-service",
      "running": true,
      "port": 8090,
      "url": "http://127.0.0.1:8090",
      "branch": "main",
      "dirty": false,
      "behind": 3,
      "updatable": true,
      "pid": 51392,
      "uptimeSec": 3600,
      "lastError": null
    }
  ]
}
```

`POST /api/projects/:id/start`：

```json
{ "ok": true, "state": "starting", "message": "已启动，等待端口就绪" }
```

启动是异步的（Next.js 要几十秒）。API 立即返回 `starting`，前端靠轮询 `/api/projects` 看 `running` 翻转。

错误响应统一：

```json
{ "ok": false, "error": "PORT_IN_USE", "message": "端口 8090 已被占用 (PID 51392)" }
```

### 6.3 目录扫描（可选能力）

`POST /api/scan` 遍历 `~/Desktop`，按特征识别项目：
- 有 `package.json` / `pyproject.toml` / `project.godot` / `*.exe` + `config.json`
- 有 `.git` 或疑似可 init

返回候选列表，**不自动写入 registry**——由用户确认后加入。避免把临时目录、实验代码误纳管。

---

## 7. 看板界面

单页 `public/index.html`，原生 JS。布局：

```
┌──────────────────────────────────────────────────────────────┐
│  github_project_initiator          [全部启动] [全部停止] [批量更新] │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│ │ LibreTV    │ │ gpp        │ │ AutoTestHub│ │ qoder2api  │  │
│ │ ● 运行中   │ │ ● 运行中   │ │ ● 运行中   │ │ ● 运行中   │  │
│ │ :8090 ↓3   │ │ :3000      │ │ :8686:5173 │ │ :8790      │  │
│ │ [停止][重启]│ │ [停止][重启]│ │ [停止][重启]│ │ [停止][重启]│  │
│ │ [更新]     │ │ [更新]     │ │ [更新]     │ │ 手动更新   │  │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐                 │
│ │ wb2api     │ │ REA        │ │ 2048       │                 │
│ │ ● 运行中   │ │ ○ 未运行   │ │ ○ 未运行   │                 │
│ │ :7863      │ │ CLI 工具   │ │ 桌面程序   │                 │
│ └────────────┘ └────────────┘ └────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

设计要点：
- 卡片显示：状态圆点、端口、git 分支、`↓N` 落后数、运行时长
- 每 3 秒轮询一次 `/api/projects`，只更新变化字段（避免整页重绘）
- 点击卡片展开最近 20 行日志（折叠面板，不跳页）
- 无端口项目（2048、Grimoire-Echoes、REA）不显示 URL，"运行中"靠进程名探测
- 全部操作有二次确认的只有"全部停止"（会杀 6 个正在跑的服务）

---

## 8. 项目结构

```
github_project_initiator/
├── README.md
├── docs/
│   └── design.md              ← 本文档
├── src/
│   ├── index.js               # 入口：HTTP 服务 + 定时任务
│   ├── server.js              # 路由与静态资源
│   ├── api/
│   │   ├── projects.js        # 项目 CRUD + 状态聚合
│   │   ├── lifecycle.js       # 启停重启
│   │   ├── update.js          # git 更新逻辑
│   │   └── scan.js            # 目录扫描
│   ├── core/
│   │   ├── registry.js        # registry.json 读写 + 校验
│   │   ├── process.js         # spawn 封装、日志管道
│   │   ├── probe.js           # TCP/进程名探测
│   │   ├── netstat.js         # 端口反查 PID
│   │   └── git.js             # git 命令封装
│   └── util/
│       ├── logger.js
│       └── exec.js            # execFile Promise 化 + 超时
├── public/
│   └── index.html             # 单页看板
├── data/
│   ├── registry.json          # 项目登记表（用户可手改）
│   └── logs/
│       └── <id>.log
├── scripts/
│   └── install-startup.ps1    # 注册开机自启（可选）
└── test/
    ├── netstat.test.js        # 端口反查精度（含 :8090 vs :80901）
    ├── probe.test.js          # 三级探测
    └── git.test.js            # --ff-only 行为、脏工作区拒绝
```

---

## 9. 实施计划

> **状态：已全部完成。** 以下各期的验收标准均已在真机验证通过，测试见 `test/`（65 项全过）。

### Phase 0：骨架与配置 ✅

- [x] `git init` + `.gitignore`（忽略 `data/logs/`、`node_modules/`）
- [x] `src/core/registry.js`：读写 + 校验（报错指出具体项目与字段）
- [x] `data/registry.json`：录入 8 个项目
- [x] `src/index.js`：HTTP 服务起在 8780

### Phase 1：状态探测 ✅

- [x] `core/netstat.js`：端口 → PID 列表，`:8090` vs `:80901` 边界有测试
- [x] `core/probe.js`：三级探测（TCP / 进程名 / PID），多来源端口去重
- [x] `api/projects.js`：`GET /api/projects` 聚合
- [x] `core/git.js`：`fetch` + `rev-list` 取 behind 数 + dirty 检测

### Phase 2：启停 ✅

- [x] `core/process.js`：`spawn` + 日志落盘 + `detached`
- [x] `api/lifecycle.js`：start / stop / restart
- [x] 停止策略三级（port / procname / command）+ 软杀 3 秒后强杀
- [x] `startupMatch` 就绪判定 + 端口探测兜底

**实测修正**：`start.vbs` 用 `WScript.Shell.Run(..., 0)` 隐藏窗口启动，启动器拉起后台进程后立即退出。初版把这判为"启动失败"，实际服务已就绪。已改为：启动器退出不判失败，继续等到超时后用端口探测裁决。

### Phase 3：更新 ✅

- [x] `core/update.js`：`git pull --ff-only`，脏工作区/detached HEAD/分支不匹配拒绝
- [x] fork 同步：fetch upstream + merge --no-edit，冲突 abort
- [x] `POST /api/update-all`：顺序执行 + 逐个结果

### Phase 4：看板 ✅

- [x] `public/index.html`：卡片布局 + 3 秒轮询 + 增量渲染
- [x] 启停/更新按钮 + 二次确认（仅"全部停止"）
- [x] 日志折叠面板
- [x] 静态服务防目录穿越

### Phase 5：常驻与收尾 ✅

- [x] `scripts/install-startup.ps1`：注册计划任务开机自启（可选，默认不做）
- [x] `test/` 65 项测试全过
- [x] README 使用说明

---

## 10. 已知取舍与风险

| # | 问题 | 取舍 | 后续 |
|---|---|---|---|
| 1 | `taskkill /F` 强杀可能损坏 qoder/wb2api 的状态文件 | 先软杀等 3 秒再强杀 | 若仍出问题，为这两个项目加 `stop.strategy: command` 走项目自己的停止逻辑 |
| 2 | `cmd.exe /c` 启动后管理器拿不到真实 PID | 停止靠端口反查，不靠 PID | 端口被别的程序占用时会误杀——启动前先校验端口空闲，占用则拒绝启动并报出占用者 PID |
| 3 | 6 个服务已在运行，是"外部启动"的 | Phase 1 只读探测，Phase 2 起停时对"非我启动的"也能停（端口反查天然支持） | 停止外部启动的服务需用户确认，提示"该服务非本管理器启动" |
| 4 | 非 git 项目无法更新 | 标为手动更新，不自动 init | 用户自行决定是否纳入 git |
| 5 | `netstat` 解析依赖输出格式 | 加边界测试锁定 `:8090` vs `80901` | Windows 版本升级导致格式变化时测试会先失败 |
| 6 | 日志无限增长 | 单文件超 10MB 自动轮转到 `.1` | 暂不接日志清理，量太小 |
| 7 | LibreTV 端口：脚本用 8090，但 `package.json` 的 `dev`/`start` 是 8080 | 以脚本为准（8090），registry 记 8090 | 在卡片上显示脚本实际端口，避免看 `package.json` 的人困惑 |

---

## 11. 后续可扩展（本次不做）

- 项目分组/标签（"游戏"、"工具"、"API 代理"）
- 启动依赖顺序（AutoTestHub 的 backend 要先于 frontend）
- 资源占用监控（CPU/内存，需定期采样，成本高于收益）
- Web 端推送替代轮询（SSE，8 个项目的状态变化频率不值得）
- 更新前自动打 tag / 备份当前 commit SHA，便于回滚
- 与 `gh` CLI 集成查看 PR/Issue（本机未装 gh，且超出"启停更新"范围）
