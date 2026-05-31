# Design: add-rag-pdf-chat

## Context

- 现状：单轮/多轮纯 LLM chat（`RunnableWithMessageHistory` + `streamChat`）
- 目标：上传 PDF → 分块 → 向量检索 → 将 relevant chunks 注入 prompt → 流式回答 + citations

## Goals / Non-Goals

**Goals**

- 单用户学习项目：本地或内存向量库即可（如 Chroma / MemoryVectorStore）
- 与现有 `sessionId` 并存：文档可 per-session 或 global（待 tasks 细化时二选一，默认 per-session）

**Non-Goals**

- 多租户、权限、大文件分布式存储
- 生产级 OCR、表格解析

## Decisions

| 决策 | 选择 | 理由 |
|------|------|------|
| PDF 解析 | `pdf-parse` 或 LangChain PDF loader | 生态一致 |
| Embedding | **本地 Feature Hashing** | DeepSeek 无 API；避免 sharp/xenova 原生依赖问题 |
| 向量存储 | 先内存/Chroma 文件持久化 | 学习成本低 |
| 检索 | Top-K similarity + 可选 MMR | 经典 RAG |
| Chat 集成 | 扩展 `POST /api/chat/stream` body：`documentIds` 或 ingest 后自动 attach session | 少改前端路径 |

## API Sketch (draft)

```http
POST /api/documents/upload
Content-Type: multipart/form-data
→ { documentId, filename, chunkCount }

POST /api/chat/stream
{ message, sessionId?, documentIds? }
→ SSE: session, token, citation?, done
```

`citation` 事件（或 `done` payload）示例：

```json
{ "sources": [{ "documentId", "page", "snippet", "score" }] }
```

## Risks / Trade-offs

- 大 PDF 阻塞：上传异步 + 状态轮询（Phase 2）
- Token 超限：检索 top-K + chunk 大小限制

| 文档生命周期 | **New chat 只清对话记忆，不删 PDF 向量**（决策 A） |

## Open Questions（已关闭）

- [x] Embedding：**本地 Feature Hashing**（替代 DeepSeek / xenova+sharp）
- [x] New chat：**不删除**向量；新 session 需重新上传 PDF
