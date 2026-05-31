# Client UI Specification

React 聊天界面与请求层（M1–M3）。与 `docs/TECHNICAL.md` §10 里程碑表对应。

## 30 秒摘要

这份 spec 管**浏览器里用户看到什么、点什么、数据怎么流动**。包括聊天页面、发消息、看 AI 逐字回复、新建会话，以及开发时 Vite 怎么把 `/api` 转到后端。

发消息时，用户气泡会立刻出现（乐观更新）；同时插入一条空的 assistant 气泡，SSE 每来一个 token 就往里追加，生成中会显示光标并禁用输入。网络层用 `fetch` + `ReadableStream` 读流，并用 buffer 处理 SSE 粘包/拆包。

下面每条 Scenario 是前端交互的验收条件。从点击 Send 到打字机效果的完整时序，见 [TECHNICAL.md §3](../../../docs/TECHNICAL.md)。

## Milestone Alignment

| 里程碑 | 本 spec 覆盖 | 关键实现（TECHNICAL.md §10） |
|--------|--------------|------------------------------|
| **M1** | 聊天 UI、Vite 代理、`QueryClientProvider` | `client/src/App.tsx`、`client/vite.config.ts`、`client/src/main.tsx` |
| **M2** | `useMutation` 乐观更新、sessionStorage | `client/src/hooks/useSendMessage.ts` |
| **M3** | SSE 读取、粘包解析、逐 token UI | `client/src/api/chat.ts`、`client/src/hooks/useSendMessage.ts` |

## Requirements

### Requirement: Application Shell (M1)

系统 MUST 提供可交互的聊天页面骨架，作为全栈链路的浏览器入口（M1）。

#### Scenario: QueryClientProvider 包裹

- GIVEN 应用启动
- WHEN React 渲染根组件
- THEN MUST 在 `main.tsx` 用 `QueryClientProvider` 包裹 `App`
- AND TanStack Query hooks（如 `useMutation`）可正常工作

#### Scenario: 消息列表与输入区

- GIVEN 用户打开应用
- WHEN 页面加载完成
- THEN MUST 展示消息列表区域、文本输入区与 Send 按钮
- AND user / assistant 消息 MUST 有可区分的样式（`message--user` / `message--assistant`）

---

### Requirement: Dev API Proxy

开发环境 MUST 通过 Vite 将 API 请求代理到 Express，避免浏览器跨域与硬编码后端地址（M1）。

#### Scenario: 代理 /api 与 /health

- GIVEN `pnpm dev:client` 启动 Vite（默认 `:5173`）
- AND Express 监听 `:3001`
- WHEN 浏览器请求同源路径 `/api/*` 或 `/health`
- THEN Vite dev server MUST 转发至 `http://localhost:3001`
- AND 前端 fetch 可使用相对路径（如 `/api/chat/stream`）

> 生产环境无 Vite 代理，需反向代理；见 `config/spec.md` § Known Limitations。

---

### Requirement: Chat Message List

系统 MUST 在 UI 中展示用户与 assistant 消息列表（M1）。

#### Scenario: 发送后展示用户消息

- GIVEN 用户在输入框提交非空内容
- WHEN 提交被接受
- THEN UI MUST 显示一条 user 角色消息

---

### Requirement: Optimistic User Message (TanStack Query)

系统 MUST 在 `useMutation` 的 `onMutate` 中立即显示用户消息，无需等待网络返回（M2）。

#### Scenario: 乐观更新顺序

- GIVEN 用户点击 Send
- WHEN mutation 执行
- THEN `onMutate`（同步）MUST 先于 `mutationFn`（异步）执行
- AND user 消息立即出现在列表中
- AND 错误态被清空

#### Scenario: 请求失败回滚

- GIVEN 乐观更新已显示 user 消息
- AND `mutationFn` 已插入空 assistant 气泡
- WHEN 流式或非流式请求最终失败
- THEN user 消息 MUST 从列表移除
- AND 内容为空的 assistant 气泡 MUST 移除
- AND 显示错误提示（`role="alert"`）

---

### Requirement: Streaming Typing Effect

系统 MUST 通过 `POST /api/chat/stream` 实现 assistant 回复逐字显示（M3）。

#### Scenario: 先插空 assistant 气泡

- GIVEN 用户已发送 message
- WHEN `mutationFn` 开始执行
- THEN MUST 先追加一条 `content: ''` 的 assistant 消息
- AND 后续 token 追加到该气泡

#### Scenario: 空 assistant 气泡后追加 token

- GIVEN 流式请求已开始
- WHEN 收到 `token` 事件
- THEN UI MUST 将 `content` 追加到当前 assistant 消息的 `content` 字段

#### Scenario: 流式进行中光标与禁用输入

- GIVEN 流式请求进行中（`sendMessage.isPending === true`）
- AND 当前最后一条为正在生成的 assistant 消息
- THEN UI SHOULD 在该气泡末尾显示闪烁光标
- AND 输入框、Send 按钮、New chat 按钮 MUST 处于 disabled 状态

#### Scenario: SSE ReadableStream 读取

- GIVEN 服务端返回 `text/event-stream`
- WHEN 客户端调用 `sendChatStream()`
- THEN MUST 使用 `response.body.getReader()` 循环读取 chunk
- AND 将 UTF-8 解码后交给 `parseSseEvents` 解析

#### Scenario: SSE 粘包/拆包解析

- GIVEN TCP 可能将多条 SSE 合并或拆分到达
- WHEN 客户端读取 `response.body`
- THEN MUST 使用 buffer 累积字节并按 `\n\n` 解析完整事件（`parseSseEvents`）
- AND 未完整的事件块 MUST 保留在 buffer 供下次读取

#### Scenario: SSE 事件分发

- GIVEN 解析出完整 SSE 事件
- WHEN `event` 为 `session` / `token` / `done` / `error`
- THEN `session` MUST 触发 `onSessionId`
- AND `token` MUST 触发 `onToken`
- AND `error` MUST 抛出含 `message` 的 Error 供 `onError` 处理

---

### Requirement: New Chat

系统 MUST 提供「New chat」操作，开始新会话并清空 UI 列表（M2）。

#### Scenario: 新建会话

- GIVEN 用户点击 New chat
- WHEN 操作成功
- THEN 客户端清空 `sessionId`（及 sessionStorage）
- AND 清空消息列表
- AND 若存在旧 sessionId，调用 `POST /api/chat/reset` 清空服务端记忆
- AND reset 失败时 MUST NOT 清空本地 state（保留错误提示）

---

### Requirement: Session Persistence in Browser

系统 MUST 将 `sessionId` 持久化到 `sessionStorage`（键名 `chat-session-id`；M2）。

#### Scenario: 保存 sessionId

- GIVEN 流式响应返回 `sessionId`（`session` 或 `done` 事件）
- WHEN `onSessionId` 或 `onSuccess` 执行
- THEN `sessionId` 写入 sessionStorage 与 React state

#### Scenario: 启动时恢复 sessionId

- GIVEN sessionStorage 中存在 `chat-session-id`
- WHEN 应用首次渲染
- THEN React `sessionId` state MUST 从 sessionStorage 初始化

---

### Requirement: Frontend State Model

前端 MUST 区分 UI 展示态与 session 关联态，与服务端记忆分工一致（M2/M3；对应 TECHNICAL.md §6）。

#### Scenario: 三条状态线

- GIVEN 用户进行多轮对话
- THEN `messages`（React state）MUST 仅驱动 UI 渲染
- AND `sessionId`（React state + sessionStorage）MUST 作为服务端记忆的「钥匙」
- AND 供 LLM 使用的完整历史 MUST 仅存在于服务端 `sessions` Map
