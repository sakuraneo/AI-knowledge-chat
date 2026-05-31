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

## 3. 全栈调用流程逻辑分析

本节描述用户点击 Send 到 AI 回复逐字显示的**完整链路**，涵盖 M1（HTTP + LCEL）、M2（Memory + 乐观更新）、M3（SSE 流式）在各层的协作方式。

### 3.1 总览架构

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              浏览器 (client)                                 │
│  App.tsx → useSendMessage → api/chat.ts                                     │
│     │              │              │                                         │
│     │  setMessages │  fetch POST  │  getReader() 循环读                      │
│     │  更新 UI     │  /api/chat/stream                                       │
└─────┼──────────────┼──────────────┼─────────────────────────────────────────┘
      │              │              │
      │              │   Vite 代理   │  (开发环境 localhost:5173 → 3001)
      │              ▼              ▼
┌─────┼──────────────────────────────────────────────────────────────────────┐
│     │                    服务端 (server)                                      │
│     │  Express index.ts                                                       │
│     │     │ res.write (SSE)  ◄── for await ◄── streamChat() ◄── chain.stream │
│     │     │                              memory/sessions.ts (session 记忆)    │
└─────┼─────┼──────────────────────────────────────────────────────────────────┘
      │     │
      │     ▼
┌─────┴──────────────────────────────────────────────────────────────────────┐
│                         DeepSeek API (HTTPS)                                  │
│                    逐 token 生成 → 流式返回                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**职责划分：**

| 层级 | 技术 | 职责 |
|------|------|------|
| 前端 | React + TanStack Query | UI、乐观更新、SSE 读取、打字机渲染 |
| 网关 | Express | 路由、校验、SSE 写入（`res.write`） |
| AI 编排 | LangChain LCEL | Prompt 模板、Memory、流式调用模型 |
| 模型 | DeepSeek V4 | 自然语言生成 |
| 配置 | `server/.env` | API Key、模型名（不暴露给前端） |

---

### 3.2 六个阶段详解

#### 阶段 1：用户发消息（纯前端）

```text
用户在 App.tsx 输入 → 点 Send → sendMessage.mutate(message)
```

TanStack Query `useMutation` 执行顺序：

| 顺序 | 钩子 | 动作 |
|------|------|------|
| ① | `onMutate`（同步） | `setMessages` 追加 user 气泡；清空错误态 |
| ② | `mutationFn`（异步） | 插入空 assistant 气泡；调用 `sendChatStream()` |

此时 UI 状态：`[用户: 你好]` + `[助手: ▌]`（空内容 + 闪烁光标）

**关键文件：** `client/src/hooks/useSendMessage.ts`、`client/src/App.tsx`

---

#### 阶段 2：前端发起 HTTP 流式请求

```typescript
// client/src/api/chat.ts
fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, sessionId }),
});
```

| 字段 | 来源 | 说明 |
|------|------|------|
| `message` | 用户输入 | 必填 |
| `sessionId` | `sessionStorage` 或空 | 有则继续同一会话；无则服务端生成 |

开发环境下，Vite 将 `/api/chat/stream` 代理到 `http://localhost:3001`。

**为何不用 `EventSource`？** `EventSource` 仅支持 GET；本接口需 POST 携带 body，故使用 `fetch` + `ReadableStream`。

---

#### 阶段 3：Express 建立 SSE 通道

```typescript
// server/src/index.ts
res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
res.flushHeaders();                              // 响应头立刻发出，连接保持打开
writeSse(res, 'session', { sessionId });         // 第一条 SSE 事件
```

从这一刻起，HTTP 连接**不会关闭**，后续通过 `res.write()` 分段写入响应体。

**推送本质：** 不是 Express 专有「推送 API」，而是 Node.js `http.ServerResponse.write()` 经 TCP 把字节送到浏览器；Express 只做薄封装。

```text
res.write() → Node http → TCP socket → 浏览器 response.body 可读流
```

---

#### 阶段 4：LangChain + DeepSeek 流式生成

```typescript
// server/src/index.ts
for await (const token of streamChat(message, sessionId)) {
  writeSse(res, 'token', { content: token });
}
```

`streamChat`（`server/src/chains/chat.ts`）内部流程：

```text
1. chainWithHistory.stream({ input }, { sessionId })
2. RunnableWithMessageHistory 从 sessions Map 取出该 session 的历史
3. 拼 Prompt：system + chat_history + 用户新消息
4. ChatOpenAI (streaming: true) → HTTPS → DeepSeek API
5. DeepSeek 每产出一个 token → LangChain yield chunk
6. streamChat 通过 async function* yield chunk 交给 for await 循环
7. 本轮 user/assistant 消息写回 ChatMessageHistory（供下轮使用）
```

`async function*` 中的 `yield chunk` 表示：**产出一小块文本并暂停**，等待消费方取走后继续，适合 LLM 边生成边转发。

---

#### 阶段 5：SSE 事件流（网络传输）

服务端按顺序写入（示例）：

```text
event: session
data: {"sessionId":"abc-123"}

event: token
data: {"content":"你"}

event: token
data: {"content":"好"}

event: done
data: {"sessionId":"abc-123"}

→ res.end()  // 关闭 HTTP 响应，连接结束
```

| 事件 | 含义 |
|------|------|
| `session` | 告知 sessionId（新建或沿用） |
| `token` | 一个文本片段（打字机的一帧） |
| `done` | 流结束，无更多 token |
| `error` | 服务端异常 |

> **注意：** 推送从第一次 `res.write` 就开始了，`done` 不是「开始推送」，而是「推送结束」的信号。

---

#### 阶段 6：前端读流 + 更新 UI

```typescript
// client/src/api/chat.ts
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;                              // 对应服务端 res.end()
  buffer += decoder.decode(value, { stream: true });
  // parseSseEvents → 按 event 类型回调
}
```

| SSE 事件 | 前端回调 | UI 效果 |
|----------|----------|---------|
| `session` | `onSessionId` → `setSessionId` + `sessionStorage` | 保存会话钥匙 |
| `token` | `onToken` → `setMessages(content += token)` | 逐字追加，打字机效果 |
| `done` | 循环退出 | — |
| `error` | `throw` → `onError` 回滚 | 移除失败的消息 |

流结束后：`mutationFn` resolve → `isPending = false` → 闪烁光标消失。

**`setMessages` 追加 token 的逻辑：**

```typescript
setMessages((prev) =>
  prev.map((m) =>
    m.id === assistantId ? { ...m, content: m.content + token } : m,
  ),
);
```

- 函数式更新：基于最新 `prev` 计算下一状态
- `map` + 新对象：不可变更新，只修改 `assistantId` 对应那条
- 每次 token 触发一次重渲染 → 视觉上逐字出现

---

### 3.3 完整时序表

| 步骤 | 位置 | 动作 |
|------|------|------|
| 1 | 前端 `onMutate` | 乐观显示用户消息 |
| 2 | 前端 `mutationFn` | 插入空 assistant 气泡 |
| 3 | 前端 `fetch` | POST 开启流式请求 |
| 4 | Express | 设置 SSE 响应头，写 `session` 事件 |
| 5 | LangChain | 读取 memory，调用 DeepSeek stream |
| 6 | DeepSeek | 逐 token 生成文本 |
| 7 | Express | 每个 token → `res.write`（SSE） |
| 8 | 前端 `reader.read` | 读字节，解析 SSE |
| 9 | 前端 `onToken` | 追加到 `assistant.content` |
| 10 | Express | 写 `done`，`res.end()` |
| 11 | 前端 | `isPending = false`，光标消失 |

---

### 3.4 三条并行「线」

理解流程时可把三条线分开看：

```text
① 控制线：fetch POST 发起 → done/end 结束
② 数据线：DeepSeek token → yield → res.write → reader.read → onToken → setMessages
③ 状态线：sessionId 与 memory 在前后端各自维护
```

| 存储内容 | 位置 | 作用 |
|----------|------|------|
| `sessionId` 字符串 | 浏览器 `sessionStorage` | 刷新后知道继续哪次会话（钥匙） |
| 对话历史 | 服务端 `sessions` Map | LLM 多轮上下文（记忆本体） |
| 消息列表 | React `messages` state | 界面展示 |

---

### 3.5 M1 / M2 / M3 在流程中的落点

| 里程碑 | 落在流程的哪一段 |
|--------|------------------|
| **M1** | 整条链打通：React ↔ Express ↔ LangChain ↔ DeepSeek |
| **M2** | `sessionId` + 服务端 `ChatMessageHistory`；`onMutate` 乐观更新 |
| **M3** | `chain.stream()` + SSE + `ReadableStream` + 逐 token 更新 UI |

---

### 3.6 非流式路径（调试 / curl）

主路径为流式；以下接口保留用于调试：

```text
POST /api/chat { message, sessionId? }
  → runChat() → chain.invoke()
  → 等待完整回复
  → res.json({ reply, sessionId })
```

与流式路径的区别：

| | 非流式 `POST /api/chat` | 流式 `POST /api/chat/stream` |
|--|-------------------------|------------------------------|
| LangChain | `.invoke()` | `.stream()` |
| HTTP 响应 | 一次 JSON | 长连接 + 多次 SSE |
| 前端 | `response.json()` | `response.body.getReader()` |
| 用户体验 | 等待后一次性显示 | 逐字打字 |

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

> **想懂项目读本文；想验收 / 改行为读 [openspec/specs/](../openspec/specs/)**（各 spec 顶部有 30 秒摘要）。

| 阶段 | 重点 | 关键文件 | OpenSpec（行为契约） |
|------|------|----------|----------------------|
| M1 | HTTP + LCEL | `server/src/index.ts`、`server/src/chains/chat.ts`、`client/src/App.tsx` | [chat/spec.md](../openspec/specs/chat/spec.md)、[client/spec.md](../openspec/specs/client/spec.md)、[config/spec.md](../openspec/specs/config/spec.md) |
| M2 | Memory + Query | `server/src/memory/sessions.ts`、`client/src/hooks/useSendMessage.ts` | [memory/spec.md](../openspec/specs/memory/spec.md)、[client/spec.md](../openspec/specs/client/spec.md) |
| M3 | 流式输出 | `POST /api/chat/stream`、`client/src/api/chat.ts` | [chat/spec.md](../openspec/specs/chat/spec.md)、[client/spec.md](../openspec/specs/client/spec.md) |
| M4 | RAG | 待定 — PDF 加载、Embeddings、向量库、Retriever | [changes/add-rag-pdf-chat/](../openspec/changes/add-rag-pdf-chat/proposal.md)（草案） |
