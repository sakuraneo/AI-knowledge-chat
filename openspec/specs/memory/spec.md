# Session Memory Specification

多轮对话记忆（M2）。记忆存于服务端，非浏览器。与 `docs/TECHNICAL.md` §10 里程碑表对应。

## 30 秒摘要

这份 spec 管**多轮对话「记不记得住」**。真正的聊天记录存在服务端内存里，按 `sessionId` 分开存；浏览器只保存 `sessionId` 这把「钥匙」（sessionStorage），刷新页面后带着同一把钥匙回来，服务端还能接上之前的上下文。

LangChain 用 `RunnableWithMessageHistory` 自动把历史塞进 Prompt 的 `chat_history`。点 New chat 或调 `POST /api/chat/reset` 会清空服务端记忆。注意：服务一重启，内存里的 session 就没了——这是当前实现的已知限制。

下面每条 Scenario 描述记忆相关的必须行为。三条状态线（UI 列表 / session 钥匙 / 服务端历史）详见 [TECHNICAL.md §6](../../../docs/TECHNICAL.md)。

## Milestone Alignment

| 里程碑 | 本 spec 覆盖 | 关键实现（TECHNICAL.md §10） |
|--------|--------------|------------------------------|
| **M2** | `RunnableWithMessageHistory`、服务端 Map、reset API | `server/src/memory/sessions.ts`、`server/src/chains/chat.ts` |

> M1 LCEL 链结构见 `chat/spec.md` § LangChain LCEL；客户端 session 钥匙见 `client/spec.md`。

## Requirements

### Requirement: RunnableWithMessageHistory Wrapper

系统 MUST 用 `RunnableWithMessageHistory` 包装 LCEL 链，按 `sessionId` 自动读写 `chat_history`（M2）。

#### Scenario: History 注入 Prompt

- GIVEN 存在有效的 LCEL 链（含 `MessagesPlaceholder('chat_history')`）
- WHEN 以 `{ configurable: { sessionId } }` 调用 `invoke` 或 `stream`
- THEN `RunnableWithMessageHistory` MUST 通过 `getMessageHistory(sessionId)` 加载历史
- AND 历史消息 MUST 注入 `chat_history` 占位符后再调用模型

#### Scenario: 轮次自动追加

- GIVEN 同 `sessionId` 完成一轮 user → assistant 对话
- WHEN 下一轮请求到达
- THEN 新 user 输入与 assistant 回复 MUST 被追加到该 session 的 `ChatMessageHistory`

---

### Requirement: Server-Side Chat History

系统 MUST 在服务端按 `sessionId` 维护对话历史，供 LangChain 注入上下文（M2）。

#### Scenario: 同 session 多轮上下文

- GIVEN 客户端使用相同 `sessionId` 连续发送多条 message
- WHEN 每次请求由 LangChain 处理
- THEN 后续回复 MUST 能利用此前同 session 的对话内容（通过 `chat_history` 注入）

#### Scenario: 不同 session 隔离

- GIVEN 两个不同的 `sessionId`
- WHEN 分别发送 message
- THEN 彼此的历史记录 MUST NOT 互相影响

---

### Requirement: Session Storage Implementation

系统 MUST 使用内存 `Map<sessionId, ChatMessageHistory>` 存储历史（当前实现；M2）。

#### Scenario: 懒创建 session

- GIVEN 首次出现某 `sessionId`
- WHEN 调用 `getSessionHistory(sessionId)`
- THEN MUST 创建新的 `ChatMessageHistory` 并存入 Map

#### Scenario: 服务重启丢失记忆

- GIVEN 服务端进程重启
- WHEN 客户端仍持有旧 `sessionId`
- THEN 服务端不再保留该 session 的历史（已知限制，见 `config/spec.md` § Known Limitations）

---

### Requirement: Reset Session Memory

系统 MUST 提供 `POST /api/chat/reset` 清空指定 session 的服务端记忆（M2）。

#### Scenario: 重置成功

- GIVEN 请求体包含有效 `sessionId`
- WHEN 客户端请求 `POST /api/chat/reset`
- THEN 响应状态码为 200
- AND 响应 JSON 为 `{ "ok": true }`
- AND 该 session 的 Map 条目被删除（`clearSession`）

#### Scenario: 缺少 sessionId

- GIVEN 请求体缺少 `sessionId` 或为空
- WHEN 客户端请求 `POST /api/chat/reset`
- THEN 响应状态码为 400
- AND 响应 JSON 包含 `{ "error": "sessionId is required" }`（或等价说明）

---

### Requirement: Client Session Key Only

浏览器 MUST 仅在 `sessionStorage` 保存 `sessionId` 字符串，MUST NOT 在客户端保存完整 LLM 对话历史作为权威来源（M2）。

#### Scenario: 刷新页面延续 session

- GIVEN 用户曾成功获得 `sessionId` 并已写入 sessionStorage
- WHEN 用户刷新页面并继续发送 message（携带同一 sessionId）
- THEN 服务端仍能关联该 session 的历史（若服务未重启）

#### Scenario: UI 消息列表非权威记忆

- GIVEN React `messages` state 仅用于界面展示
- WHEN 用户刷新页面
- THEN UI 列表清空
- AND 多轮上下文仍由服务端 `sessions` Map 提供（非客户端恢复）
