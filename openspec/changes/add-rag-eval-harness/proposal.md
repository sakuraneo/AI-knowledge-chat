# Change: add-rag-eval-harness (M4.5)

## Why

RAG 回答质量难以用单元测试覆盖；需要轻量评测脚本对比「期望要点」与模型输出。

## What Changes

- `eval/` 目录：`cases.json`、runner 脚本、可选 npm script `pnpm eval:rag`
- 不修改生产 API 契约（仅调用现有 chat/RAG 端点）

## When

**MUST** 在 `add-rag-pdf-chat` archive 之后 propose/apply。

## Impact

- 新 spec 域可选：`openspec/specs/eval/`（archive 时创建）

## Approval

- [ ] M4 已 archive
- [ ] 用户确认后 apply
