# Delta: Chat (RAG)

## ADDED Requirements

### Requirement: RAG-Aware Streaming Chat

当请求携带有效 `documentIds`（或 session 已绑定文档）时，系统 MUST 在生成回复前检索相关文档片段并注入 LLM 上下文。

#### Scenario: 带文档的流式问答

- GIVEN 用户已上传并 ingest 至少一个 PDF
- AND 请求 `POST /api/chat/stream` 包含 `message` 与关联的 `documentIds`（或 session 默认文档）
- WHEN 服务端处理请求
- THEN 响应仍为 SSE 流（`session`、`token`、`done`）
- AND 回复内容 MUST 基于检索到的文档片段（非纯幻觉）
- AND `done` 或独立 `citation` 事件 MUST 包含 `sources` 数组（至少含 document 标识与 snippet）

#### Scenario: 无文档时行为不变

- GIVEN 请求未关联任何文档
- WHEN 客户端请求 `POST /api/chat/stream`
- THEN 行为与 M3 baseline 一致（纯 LLM + 历史记忆）
