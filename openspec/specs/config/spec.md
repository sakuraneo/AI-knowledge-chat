# Configuration Specification

Monorepo、环境与运行约束（M1）。与 `docs/TECHNICAL.md` §10 里程碑表对应。

## 30 秒摘要

这份 spec 管**项目怎么搭、密钥放哪、怎么启动**。仓库是 pnpm monorepo：`client` 和 `server` 两个子包，根目录一条 `pnpm dev` 同时跑前后端。API Key 只写在 `server/.env`，绝不能进前端 bundle。

DeepSeek 通过 LangChain 的 `ChatOpenAI` + 自定义 `baseURL` 接入，本质是 OpenAI 兼容协议，不是真的调 OpenAI 官方。文末 **Known Limitations** 列出了当前已知短板（无鉴权、内存 session、生产要自己配反向代理等）。

下面每条 Scenario 是环境与工程约束的验收条件。环境变量表与开发命令详见 [TECHNICAL.md §7–§9](../../../docs/TECHNICAL.md)。

## Milestone Alignment

| 里程碑 | 本 spec 覆盖 | 关键实现（TECHNICAL.md §10） |
|--------|--------------|------------------------------|
| **M1** | pnpm workspace、根脚本、`.env`、DeepSeek 配置 | `pnpm-workspace.yaml`、`package.json`、`server/src/config.ts` |

> HTTP/LCEL 见 `chat/spec.md`；Vite 代理见 `client/spec.md` § Dev API Proxy。

## Requirements

### Requirement: pnpm Monorepo Workspace

系统 MUST 使用 pnpm workspace 管理 `client` 与 `server` 两个子包（M1）。

#### Scenario: workspace 声明

- GIVEN 仓库根目录存在 `pnpm-workspace.yaml`
- WHEN 执行 `pnpm install`
- THEN MUST 在根目录生成单一 `pnpm-lock.yaml`
- AND `client`、`server` 各自拥有独立 `package.json` 与依赖树

#### Scenario: 根脚本编排

- GIVEN 根 `package.json` 定义 `dev` / `build` 脚本
- WHEN 执行 `pnpm dev`
- THEN MUST 通过 `--parallel --filter server --filter client` 并行启动前后端
- WHEN 执行 `pnpm build`
- THEN MUST 依次构建 server（`tsc`）与 client（`vite build`）

---

### Requirement: Server-Only Secrets

系统 MUST 仅在 `server/.env` 配置 LLM 密钥与模型参数；MUST NOT 在前端代码或构建产物中嵌入 `DEEPSEEK_API_KEY`（M1）。

#### Scenario: 前端无密钥

- GIVEN 生产或开发构建 client 包
- WHEN 检查客户端 bundle
- THEN MUST NOT 包含真实 API Key

#### Scenario: dotenv 加载路径

- GIVEN 服务端启动
- WHEN `config.ts` 加载环境变量
- THEN MUST 从 `server/.env` 读取（`path.resolve` 相对 `server/src` 的 `../.env`）
- AND MUST NOT 依赖仓库根目录 `.env`

---

### Requirement: Environment Variables

服务端 MUST 从 `server/.env` 读取以下变量（参见 `server/.env.example`）：

| Variable | Required | Default | 说明 |
|----------|----------|---------|------|
| `DEEPSEEK_API_KEY` | Yes | — | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | No | `https://api.deepseek.com` | API 基础地址 |
| `MODEL` | No | `deepseek-v4-flash` | 模型 ID（可选 `deepseek-v4-pro`） |
| `PORT` | No | `3001` | Express 监听端口 |

#### Scenario: 缺少 API Key 启动失败

- GIVEN `DEEPSEEK_API_KEY` 未设置
- WHEN 服务端加载 config
- THEN 启动 MUST 失败并抛出 `Missing required environment variable: DEEPSEEK_API_KEY`

---

### Requirement: DeepSeek via OpenAI-Compatible Client

系统 MUST 通过 LangChain `ChatOpenAI` + 自定义 `baseURL` 调用 DeepSeek（OpenAI 兼容协议），而非将密钥发往 OpenAI 官方地址（M1）。

#### Scenario: 路由到 DeepSeek

- GIVEN 有效 `DEEPSEEK_API_KEY` 与默认 `DEEPSEEK_BASE_URL`
- WHEN LangChain 发起 chat 请求
- THEN 请求 MUST 发往配置的 DeepSeek 端点
- AND `ChatOpenAI` 类名仅表示协议适配，不代表调用 OpenAI 官方 API

---

### Requirement: Development Commands

仓库 MUST 提供标准开发命令（M1；对应 TECHNICAL.md §8）。

#### Scenario: 常用命令

- GIVEN 开发者已 `pnpm install`
- WHEN 需要本地开发
- THEN 以下命令 MUST 可用：
  - `pnpm dev` — 并行启动 client + server
  - `pnpm dev:client` — 仅 Vite（`:5173`）
  - `pnpm dev:server` — 仅 tsx watch（`:3001`）
  - `pnpm build` — 构建 server + client

---

## Known Limitations

以下为本项目当前已知约束（对应 TECHNICAL.md §9），M4+ 变更须通过 OpenSpec change 显式修改。

| 限制 | 说明 |
|------|------|
| 内存 session | 服务重启后丢失；不适合生产多实例 |
| 无鉴权 | 任何能访问 API 的人均可聊天 |
| 尚无 RAG | M4 将加入 PDF + 向量检索（见 `changes/add-rag-pdf-chat/`） |
| Vite 代理仅开发 | 生产需 nginx 等反向代理 `/api` |

#### Scenario: 生产部署无 Vite

- GIVEN 生产环境仅部署静态 `client/dist` 与 Node `server`
- WHEN 浏览器访问前端域名
- THEN MUST 通过反向代理将 `/api`、`/health` 转发至 Express
- AND MUST NOT 依赖 Vite dev proxy
