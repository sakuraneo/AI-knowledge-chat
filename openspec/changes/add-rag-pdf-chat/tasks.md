# Tasks: add-rag-pdf-chat

> 实现前须用户确认。按 Phase 分批 apply。

## Phase 1 — Server RAG

- [ ] 1.1 添加依赖：`pdf` loader、vector store、embedding client
- [ ] 1.2 `server/.env.example` 增加 embedding / vector 相关变量
- [ ] 1.3 实现 `POST /api/documents/upload`（multer 或 busboy）
- [ ] 1.4 ingest：parse → split → embed → store（关联 documentId + sessionId）
- [ ] 1.5 RAG retriever + 扩展 chat chain（context 注入 system/human template）
- [ ] 1.6 扩展 `POST /api/chat/stream`：支持 `documentIds`，SSE 增加 citations
- [ ] 1.7 更新 `docs/TECHNICAL.md` 调用链一节

## Phase 2 — Client Upload

- [ ] 2.1 上传组件 + API client
- [ ] 2.2 文档列表/处理中状态
- [ ] 2.3 发送 message 时携带 `documentIds` 或 session 默认文档

## Phase 3 — Citations UI

- [ ] 3.1 解析 SSE `citation` / `done.sources`
- [ ] 3.2 消息气泡下展示引用（文件名、页码、摘要）
- [ ] 3.3 样式与空态

## Verification (manual)

- [ ] 上传 sample PDF，问文档内事实，回答含正确引用
- [ ] New chat 后行为符合 design 决策
