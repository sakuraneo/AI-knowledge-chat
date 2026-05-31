# Design: add-api-test-harness

## Stack

- **Runner**: Vitest
- **HTTP**: Supertest 对 Express app export
- **Mock**: vi.mock LangChain chain，返回预设 stream chunks

## Test Matrix (draft)

| 用例 | 断言 |
|------|------|
| GET /health | 200, status ok |
| POST /api/chat 缺 message | 400 |
| POST /api/chat/stream | SSE 事件顺序 session → token* → done |
| POST /api/chat/reset | 200, 后续无历史 |
| parseSseEvents | 粘包/拆包 buffer |

## Non-Goals

- E2E Playwright
- 真实 DeepSeek 集成测试
