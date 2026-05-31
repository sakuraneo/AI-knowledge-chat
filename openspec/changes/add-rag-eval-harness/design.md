# Design: add-rag-eval-harness

## Approach

- `eval/cases.json`：每条 `{ id, pdfFixture, question, expectedKeywords[] }`
- Runner：上传 fixture PDF → 提问 → 检查 reply 是否包含 keywords / citation 是否存在
- 评分：pass/fail + 简单命中率，不接 LangSmith（学习项目够用）

## Non-Goals

- CI 门禁、LLM-as-judge、大规模 benchmark
