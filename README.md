# AI Knowledge Chat

一个全栈 AI 聊天 Demo，用于学习 **React**、**Node.js**、**LangChain** 和前端工程化。项目支持多轮对话记忆和逐 token 流式输出，通过 OpenAI 兼容 API 接入 **DeepSeek V4**。

## 功能特性

| 里程碑 | 能力 |
|--------|------|
| **M1** | Monorepo 脚手架、Express API、React 聊天 UI、LangChain LCEL 链 |
| **M2** | 服务端 session 记忆、TanStack Query 乐观更新 |
| **M3** | SSE 流式输出、LangChain `chain.stream()`、UI 打字机效果 |
| **M4** | PDF 上传、DeepSeek Embedding、内存 RAG、SSE citations |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19、TypeScript、Vite 6、TanStack Query |
| 后端 | Node.js、Express 5、TypeScript |
| AI | LangChain.js、DeepSeek V4（`deepseek-v4-flash` / `deepseek-v4-pro`） |
| 工具 | pnpm workspace（monorepo） |

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm

### 安装配置

```bash
pnpm install
cp server/.env.example server/.env
# 编辑 server/.env，填入 DEEPSEEK_API_KEY
```

在 [DeepSeek Platform](https://platform.deepseek.com) 申请 API Key。

### 启动

```bash
pnpm dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

也可分开启动：

```bash
pnpm dev:client   # 仅前端
pnpm dev:server   # 仅后端
```

## 项目结构

```text
ai-knowledge-chat/
├── client/                 # Vite + React 前端
│   └── src/
│       ├── api/            # HTTP / SSE 请求封装
│       ├── hooks/          # TanStack Query Hooks
│       └── App.tsx         # 聊天 UI
├── server/                 # Express + LangChain 后端
│   └── src/
│       ├── chains/         # LCEL prompt | model 链
│       ├── memory/         # 内存 session 存储
│       ├── config.ts       # 环境变量配置
│       └── index.ts        # HTTP 路由
├── openspec/               # OpenSpec：specs + changes（M4 起）
├── docs/
│   ├── TECHNICAL.md        # 架构与 API 详细文档
│   ├── RAG.TECHNOLOGY.md   # RAG 原理、实现链路、FAQ
│   ├── SPECTECHNICAL.md    # Spec 机制、delta 合并规则、FAQ
│   └── OPENSPEC.md         # Spec 驱动工作流说明
├── pnpm-workspace.yaml
└── package.json
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `POST` | `/api/chat` | 非流式聊天（JSON） |
| `POST` | `/api/chat/stream` | 流式聊天（SSE） |
| `POST` | `/api/documents/upload` | 上传 PDF（multipart） |
| `GET` | `/api/documents?sessionId=` | 列出 session 文档 |
| `POST` | `/api/chat/reset` | 清空 session 对话记忆（保留 PDF 向量） |

**想懂项目读 [docs/TECHNICAL.md](./docs/TECHNICAL.md)；懂 RAG / Embedding / Citation 读 [docs/RAG.TECHNOLOGY.md](./docs/RAG.TECHNOLOGY.md)；想验收 / 改行为读 [openspec/specs/](./openspec/specs/)；Spec 合并规则与 FAQ 见 [docs/SPECTECHNICAL.md](./docs/SPECTECHNICAL.md)。**

## 环境变量

**仅在 `server/.env` 中配置**（切勿提交真实密钥）：

```env
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
MODEL=deepseek-v4-flash   # 或 deepseek-v4-pro
EMBEDDING_MODEL=hashing-local
EMBEDDING_DIMENSIONS=512
PORT=3001
```

## OpenSpec（M4 起）

行为契约在 `openspec/specs/`（chat、memory、client、config）；流程说明见 [docs/OPENSPEC.md](./docs/OPENSPEC.md)。  
M4 变更草案：`openspec/changes/add-rag-pdf-chat/`（审阅后实现，不写代码直到确认）。

| 步骤 | 说明 |
|------|------|
| 阅读 | `docs/OPENSPEC.md`、`openspec/changes/add-rag-pdf-chat/proposal.md` |
| 审阅 | design.md、tasks.md、delta specs |
| 实现 | 确认后 Phase 1 → 2 → 3（或 Cursor `/opsx:apply`） |

可选 CLI：`npm i -g @fission-ai/openspec@latest && openspec init`（生成 `/opsx:*` 命令；目录已手建可跳过）。

后续：`add-rag-eval-harness`（评测）、`add-api-test-harness`（M5 测试）。

## 路线图

- [x] M1 — 基础聊天
- [x] M2 — 多轮记忆
- [x] M3 — SSE 流式输出
- [x] M4 — RAG（PDF + 引用）
- [ ] M4.5 — RAG 评测 harness
- [ ] M5 — API 测试 harness、限流、部署

## 许可证

个人学习项目。
