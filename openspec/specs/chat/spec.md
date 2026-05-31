# Chat API Specification

HTTP 路由与 LangChain 调用（M1 + M3）。与 `docs/TECHNICAL.md` §10 里程碑表对应。

## 30 秒摘要

这份 spec 管**服务端 HTTP 接口和 LangChain 怎么调模型**：健康检查、一次性聊天（调试用）、以及主流的 SSE 流式聊天。你可以把它理解成「后端 API 说明书 + 验收清单」。

日常用户走的是 `POST /api/chat/stream`：服务端先推 `session`，再一段段推 `token`，最后 `done`。调试或 curl 可以用 `POST /api/chat` 一次拿完整 JSON。两条路径背后都是同一条 LCEL 链，区别只是 `invoke` 还是 `stream`。

下面每条 Scenario 是在说：**在什么情况下，接口必须返回什么**。想搞懂调用链和时序，请读 [TECHNICAL.md §3–§5](../../../docs/TECHNICAL.md)。

## Milestone Alignment

| 里程碑 | 本 spec 覆盖 | 关键实现（TECHNICAL.md §10） |
|--------|--------------|------------------------------|
| **M1** | LCEL 链、非流式 `POST /api/chat`、`GET /health` | `server/src/chains/chat.ts`、`server/src/index.ts` |
| **M3** | SSE `POST /api/chat/stream`、`chain.stream()` | `server/src/index.ts`、`server/src/chains/chat.ts` |

> M2 记忆注入见 `memory/spec.md`；前端消费见 `client/spec.md`；环境与 monorepo 见 `config/spec.md`。

## Requirements

### Requirement: Health Check

系统 MUST 提供健康检查接口，用于确认服务存活（M1）。

#### Scenario: 健康检查成功

- GIVEN 服务已启动
- WHEN 客户端请求 `GET /health`
- THEN 响应状态码为 200
- AND 响应 JSON 包含 `{ "status": "ok" }`

---

### Requirement: LangChain LCEL Chain

系统 MUST 通过 LangChain LCEL 编排 Prompt → Model → OutputParser，作为所有 chat 路径的 AI 编排层（M1）。

#### Scenario: LCEL 管道结构

- GIVEN 服务端已加载有效 `DEEPSEEK_API_KEY` 与模型配置
- WHEN 处理任意 chat 请求
- THEN 链结构 MUST 为 `prompt.pipe(model).pipe(new StringOutputParser())`
- AND Prompt MUST 包含 system 消息、`MessagesPlaceholder('chat_history')` 与用户 `{input}`
- AND Model MUST 为 `ChatOpenAI`，并通过 `configuration.baseURL` 指向 DeepSeek 兼容端点

#### Scenario: 非流式 invoke 路径

- GIVEN 客户端请求 `POST /api/chat`
- WHEN 服务端处理该请求
- THEN MUST 调用 `chainWithHistory.invoke()`（经 `runChat()`）
- AND 等待完整文本后一次性返回 JSON `{ reply, sessionId }`

#### Scenario: 流式 stream 路径

- GIVEN 客户端请求 `POST /api/chat/stream`
- WHEN 服务端处理该请求
- THEN MUST 调用 `chainWithHistory.stream()`（经 `streamChat()` async generator）
- AND Model MUST 配置 `streaming: true`
- AND 逐 chunk yield 非空字符串 token 供 SSE 写入

---

### Requirement: Non-Streaming Chat

系统 MUST 支持通过 `POST /api/chat` 一次性返回完整 assistant 回复（非流式，用于 curl / 调试；M1）。

#### Scenario: 正常非流式对话

- GIVEN 请求体包含非空字符串 `message`
- WHEN 客户端请求 `POST /api/chat`
- THEN 响应状态码为 200
- AND 响应 JSON 包含 `reply`（字符串）与 `sessionId`（字符串）

#### Scenario: 缺少 message

- GIVEN 请求体缺少 `message` 或 `message` 为空
- WHEN 客户端请求 `POST /api/chat`
- THEN 响应状态码为 400
- AND 响应 JSON 包含 `{ "error": "message is required" }`（或等价错误说明）

#### Scenario: LLM 调用失败（非流式 500）

- GIVEN 请求体包含有效 `message`
- AND LangChain 或 DeepSeek API 调用抛出异常
- WHEN 客户端请求 `POST /api/chat`
- THEN 响应状态码为 500
- AND 响应 JSON 包含 `error: "chat_failed"` 与可读 `message` 字段

---

### Requirement: Streaming Chat (SSE)

系统 MUST 通过 `POST /api/chat/stream` 以 Server-Sent Events 逐 token 返回 assistant 回复（主路径；M3）。

#### Scenario: 正常流式输出

- GIVEN 请求体包含非空 `message` 与可选 `sessionId`
- WHEN 客户端请求 `POST /api/chat/stream`
- THEN 响应 `Content-Type` 为 `text/event-stream; charset=utf-8`
- AND 响应头包含 `Cache-Control: no-cache, no-transform` 与 `Connection: keep-alive`
- AND 连接保持打开直至流结束
- AND 依次发送 `session`、`token`（可多次）、`done` 事件
- AND 每个 `token` 事件的 data 包含 `{ "content": "<片段>" }`
- AND `done` 事件的 data 包含 `{ "sessionId": "<uuid>" }`

#### Scenario: 流式错误（SSE error 事件）

- GIVEN SSE 连接已建立（已发送 `session` 事件）
- AND LangChain 或上游 API 调用失败
- WHEN 流式处理中发生错误
- THEN 服务端发送 `error` 事件，data 含 `{ "message": "<原因>" }`
- AND 随后关闭连接（不返回 HTTP 500，因 headers 已 flush）

#### Scenario: 缺少 message（流式）

- GIVEN 请求体缺少有效 `message`
- WHEN 客户端请求 `POST /api/chat/stream`
- THEN 响应状态码为 400（在建立 SSE 前返回 JSON 错误）
- AND MUST NOT 发送 SSE 事件

---

### Requirement: Session ID Assignment

系统 MUST 为每次对话关联 `sessionId`；客户端未提供时由服务端生成 UUID（M1/M2 交界）。

#### Scenario: 服务端生成 sessionId

- GIVEN 请求未包含 `sessionId` 或 `sessionId` 为空字符串
- WHEN 处理 chat 或 chat/stream 请求
- THEN 服务端生成新的 UUID
- AND 非流式响应 JSON 或 SSE 的 `session` / `done` 事件中返回该 `sessionId`

#### Scenario: 客户端复用 sessionId

- GIVEN 请求体包含非空 `sessionId`
- WHEN 处理 chat 或 chat/stream 请求
- THEN 服务端 MUST 使用该 `sessionId`（trim 后）关联记忆与响应

---

### Requirement: Express Request Handling

Express 层 MUST 解析 JSON 请求体并启用 CORS（M1）。

#### Scenario: JSON body 解析

- GIVEN 客户端发送 `Content-Type: application/json`
- WHEN 请求到达 Express
- THEN `express.json()` MUST 解析 body（limit 1mb）
- AND 路由 handler 从 `req.body.message` / `req.body.sessionId` 读取字段

#### Scenario: CORS 允许浏览器跨域（开发）

- GIVEN 浏览器从 Vite dev server（如 `:5173`）发起请求
- WHEN 请求经代理或直接访问 API
- THEN 服务端 MUST 通过 `cors()` 允许浏览器跨域访问（开发联调）
