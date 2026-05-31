# Tasks: add-rag-pdf-chat

> 用户已确认：Embedding A（DeepSeek）+ New chat A（只清对话，不删 PDF 向量）。

## Phase 1 — Server RAG

- [x] 1.1 添加依赖：`pdf-parse`、`@langchain/textsplitters`、multer
- [x] 1.2 `server/.env.example` 增加 embedding / vector 相关变量
- [x] 1.3 实现 `POST /api/documents/upload`（multer）
- [x] 1.4 ingest：parse → split → embed → store（关联 documentId + sessionId）
- [x] 1.5 RAG retriever + 扩展 chat chain（context 注入 system template）
- [x] 1.6 扩展 `POST /api/chat/stream`：支持 `documentIds`，SSE 增加 citations
- [x] 1.7 更新 `docs/TECHNICAL.md` 调用链一节

## Phase 2 — Client Upload

- [x] 2.1 上传组件 + API client
- [x] 2.2 文档列表/处理中状态
- [x] 2.3 发送 message 时携带 `documentIds` 或 session 默认文档

## Phase 3 — Citations UI

- [x] 3.1 解析 SSE `citation` / `done.sources`
- [x] 3.2 消息气泡下展示引用（文件名、摘要）
- [x] 3.3 样式与空态

## Verification (manual)

- [ ] 上传 sample PDF，问文档内事实，回答含正确引用
- [ ] New chat 后行为符合 design 决策（对话清空，旧 session PDF 仍留服务端）
