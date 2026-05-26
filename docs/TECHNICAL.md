# 技术文档

## 1. 项目概览

**AI Knowledge Chat** 是一个 pnpm monorepo，包含两个子包：

- `client` — 浏览器端 UI（React + Vite）
- `server` — HTTP API + LangChain 编排层（Express + Node）

后端持有所有 LLM 密钥和对话记忆；前端只负责发送用户消息并渲染回复。

```
┌─────────────┐     HTTP/SSE      ┌─────────────┐     HTTPS      ┌──────────────┐
│   React     │ ───────────────► │   Express   │ ─────────────► │  DeepSeek V4 │
│   (client)  │ ◄─────────────── │   (server)  │ ◄───────────── │     API      │
└─────────────┘                   └─────────────┘                └──────────────┘
                                         │
                                         ▼
                                  LangChain LCEL
                                  + Session Memory
```

---

## 2. Monorepo 目录结构

### 根目录（`/`）

| 文件 | 作用 |
|------|------|
| `pnpm-workspace.yaml` | 声明 `client` 和 `server` 为工作区子包 |
| `package.json` | 根脚本：`pnpm dev`、`pnpm build` |
| `.gitignore` | 忽略 `node_modules`、`.env`、`dist` 等 |

### 前端（`/client`）

| 文件 | 作用 |
|------|------|
| `vite.config.ts` | 开发服务器；将 `/api` 代理到 `localhost:3001` |
| `src/main.tsx` | React 入口；包裹 `QueryClientProvider` |
| `src/App.tsx` | 聊天 UI、消息列表、输入区、New chat 按钮 |
| `src/api/chat.ts` | `sendChatStream()` SSE 解析、`resetChatSession()` |
| `src/hooks/useSendMessage.ts` | `useMutation` 乐观更新 + 流式 token 追加 |

**构建工具：** Vite 6（开发 + 生产打包）

### 后端（`/server`）

| 文件 | 作用 |
|------|------|
| `src/config.ts` | 读取 `server/.env`（`DEEPSEEK_API_KEY`、`MODEL`、`PORT`） |
| `src/index.ts` | Express 路由、SSE 写入、错误处理 |
| `src/chains/chat.ts` | LangChain LCEL 链 + `RunnableWithMessageHistory` |
| `src/memory/sessions.ts` | 内存 `Map<sessionId, ChatMessageHistory>` |

**构建工具：** `tsc`（TypeScript 编译为 JavaScript，不做 bundle）

---

## 3. 请求流程

### 3.1 流式聊天（主路径）

```
1. 用户在 App.tsx 提交消息
2. useSendMessage.onMutate → 立即追加用户气泡（乐观更新）
3. useSendMessage.mutationFn → POST /api/chat/stream { message, sessionId? }
4. Vite 开发代理转发到 Express :3001
5. Express 调用 streamChat() → LangChain chain.stream()
6. 每个 token → SSE 事件: token { content }
7. 客户端 onToken → 追加到 assistant 气泡（打字机效果）
8. SSE 事件: done { sessionId } → 将 sessionId 写入 sessionStorage
```

### 3.2 非流式聊天（调试 / curl）

```
POST /api/chat { message, sessionId? }
→ runChat() → chain.invoke()
→ { reply, sessionId }
```

---

## 4. LangChain 设计

### 4.1 LCEL 链

```typescript
prompt.pipe(model).pipe(new StringOutputParser())
```

- **Prompt：** system 消息 + `MessagesPlaceholder('chat_history')` + 用户输入
- **Model：** `ChatOpenAI` + DeepSeek `baseURL`（OpenAI 兼容协议）
- **Parser：** 将模型输出解析为纯文本字符串

### 4.2 多轮记忆（M2）

`RunnableWithMessageHistory` 包装整条链：

- **键：** `sessionId`（UUID，客户端未传时由服务端生成）
- **存储：** 每个 session 对应一份 `ChatMessageHistory`，保存在服务端内存
- **行为：** 历史轮次自动注入 `chat_history` 占位符

> 记忆在服务端。浏览器 `sessionStorage` 只存 `sessionId` 字符串（「钥匙」），不存完整聊天记录。

### 4.3 流式输出（M3）

- 模型：`streaming: true`
- 链：`chainWithHistory.stream()` 逐块 yield 字符串
- Express 写入 Server-Sent Events：

| 事件 | 载荷 |
|------|------|
| `session` | `{ sessionId }` |
| `token` | `{ content }` |
| `done` | `{ sessionId }` |
| `error` | `{ message }` |

---

## 5. HTTP API 参考

### `GET /health`

**响应 200**

```json
{ "status": "ok" }
```

---

### `POST /api/chat`

非流式聊天（一次性返回完整 JSON）。

**请求**

```json
{
  "message": "Hello",
  "sessionId": "optional-uuid"
}
```

**响应 200**

```json
{
  "reply": "Hi! How can I help?",
  "sessionId": "abc-123"
}
```

**错误：** `400` 缺少 message；`500` LLM 调用失败

---

### `POST /api/chat/stream`

SSE 流式聊天。

**请求：** 与 `/api/chat` 相同

**响应：** `Content-Type: text/event-stream`

```text
event: session
data: {"sessionId":"abc-123"}

event: token
data: {"content":"你"}

event: token
data: {"content":"好"}

event: done
data: {"sessionId":"abc-123"}
```

---

### `POST /api/chat/reset`

清空指定 session 的服务端记忆。

**请求**

```json
{ "sessionId": "abc-123" }
```

**响应 200**

```json
{ "ok": true }
```

---

## 6. 前端状态模型

| 状态 | 存放位置 | 用途 |
|------|----------|------|
| `messages` | `App.tsx` 的 React `useState` | UI 消息列表 |
| `sessionId` | React state + `sessionStorage` | 刷新页面后继续同一会话 |
| `sendMessage.isPending` | TanStack Query `useMutation` | 禁用输入、显示光标 |
| 对话历史（供 LLM 使用） | 服务端 `sessions` Map | 真正的多轮上下文 |

### 乐观更新流程

1. `onMutate` — 网络返回前先把用户消息显示到 UI
2. `mutationFn` — 流式将 assistant token 写入新气泡
3. `onError` — 失败时移除用户消息和空的 assistant 气泡

---

## 7. 环境配置

所有密钥放在 **`server/.env`**（已 gitignore）：

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | API 基础地址 |
| `MODEL` | 否 | `deepseek-v4-flash` | 模型 ID（更强可选 `deepseek-v4-pro`） |
| `PORT` | 否 | `3001` | Express 监听端口 |

### 为什么 DeepSeek 用 `ChatOpenAI`？

DeepSeek 提供 OpenAI 兼容的 Chat Completions API。LangChain 的 `ChatOpenAI` 是**协议适配器**——实际路由由 `baseURL`、`apiKey`、`model` 决定，与类名无关。

---

## 8. 开发命令

```bash
pnpm install          # 安装所有工作区依赖
pnpm dev              # 并行启动 client + server
pnpm dev:client       # 仅 Vite（:5173）
pnpm dev:server       # 仅 tsx watch（:3001）
pnpm build            # 构建 server（tsc）+ client（vite）
```

---

## 9. 已知限制

| 限制 | 说明 |
|------|------|
| 内存 session | 服务重启后丢失；不适合生产多实例部署 |
| 无鉴权 | 任何能访问 API 的人均可聊天 |
| 尚无 RAG | M4 将加入文档上传 + 向量检索 |
| Vite 代理 | 仅开发环境；生产需 nginx 等反向代理 `/api` |

---

## 10. 里程碑路线图（学习用）

| 阶段 | 重点 | 关键文件 |
|------|------|----------|
| M1 | HTTP + LCEL | `server/src/index.ts`、`server/src/chains/chat.ts`、`client/src/App.tsx` |
| M2 | Memory + Query | `server/src/memory/sessions.ts`、`client/src/hooks/useSendMessage.ts` |
| M3 | 流式输出 | `POST /api/chat/stream`、`client/src/api/chat.ts` |
| M4 | RAG | 待定 — PDF 加载、Embeddings、向量库、Retriever |
