# Change: add-api-test-harness (M5)

## Why

保证 API 契约、SSE 解析、session reset 等行为在重构后仍正确；使用 mock LLM 避免真实 API 费用与 flaky。

## What Changes

- Vitest + Supertest（server）
- 可选：client 对 `parseSseEvents` 的单元测试
- Mock LangChain / ChatOpenAI 返回固定 token 流

## When

M4（及可选 eval harness）完成后。

## Impact

- `openspec/specs/chat` 等已有 requirement 由测试佐证
- CI 可选（`.github/workflows`）

## Approval

- [ ] 用户确认后 apply
