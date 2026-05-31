# Change: add-rag-pdf-chat (M4)

## Why

用户需要基于上传的 PDF 进行问答（RAG），并在回答中展示引用来源，完成学习路径 M4。

## What Changes

- **Server**：PDF 上传、解析、分块、向量化、检索；LangChain RAG chain；`POST /api/documents`（或等价）与 chat 集成
- **Client**：上传 UI、文档列表/状态、回答中的 citation 展示
- **Config**：向量库/embedding 相关环境变量（见 design.md）

## Impact

- Affected specs: `chat`, `memory`, `client`, `config`（delta 在 `specs/` 子目录）
- 不修改 M1–M3 已有非流式/流式契约的破坏性行为，仅扩展

## Phases (apply 顺序)

1. **Phase 1 — Server RAG**：上传 API、ingest、retriever、chain 注入 context
2. **Phase 2 — Client upload**：选择 PDF、进度、绑定 session/document
3. **Phase 3 — Citations**：SSE/JSON 中带 source 元数据，UI 展示引用

## Out of Scope (本 change)

- RAG 质量评测 harness → `add-rag-eval-harness`
- Vitest/Supertest 自动化 → `add-api-test-harness` (M5)

## Approval

- [x] 用户审阅 proposal + design + tasks
- [x] 用户明确回复「可以」后再 `/opsx:apply` Phase 1
