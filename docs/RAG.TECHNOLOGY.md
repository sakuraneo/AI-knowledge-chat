# RAG 技术文档

本文档汇总 **AI Knowledge Chat M4** 涉及的 RAG（Retrieval-Augmented Generation，检索增强生成）概念、本项目实现、以及开发过程中的常见问答。

> **阅读指引**
> - 项目架构与 API 细节 → [TECHNICAL.md](./TECHNICAL.md) §4.4、§5
> - Spec 行为契约 → [openspec/changes/add-rag-pdf-chat/](../openspec/changes/add-rag-pdf-chat/proposal.md)（待 archive）
> - OpenSpec 流程 → [OPENSPEC.md](./OPENSPEC.md)

---

## 1. RAG 是什么？

**RAG = 先检索相关文档片段，再让大模型基于这些片段生成回答。**

| 问题 | 没有 RAG | 有 RAG |
|------|----------|--------|
| 知识截止 | 模型不知道训练后、私有文档里的内容 | 可查询用户上传的 PDF |
| 幻觉 | 容易「看起来对」但其实是编的 | 要求依据检索片段回答，并展示引用 |

**典型应用：** 企业知识库问答、PDF/论文问答、客服文档检索、代码库文档助手。

**与相关方案的区别：**

| 方案 | 适用场景 |
|------|----------|
| 纯 Chat LLM | 通用对话，不需要私有文档 |
| Fine-tuning | 改说话风格/格式，不是频繁更新事实 |
| **RAG** | 事实来自**你的文档**，文档常更新 |
| Agent + Tools | 多步决策（查文档、调 API、算数等） |

---

## 2. RAG 原理：五步流水线

```text
1. Ingest（入库）   PDF → 提取文字 → 切成 chunk
2. Embed（向量化）  每个 chunk → 数字向量
3. Store（存储）    向量 + 原文 + 元数据（documentId、filename…）
4. Retrieve（检索） 用户问题 → 向量 → 与库中 chunk 比相似度 → Top-K
5. Generate（生成） Top-K 原文塞进 prompt → LLM 回答 + 引用展示
```

### 为什么用向量？

计算机难以直接判断两段话「意思是否相近」。Embedding 把文本映射到高维空间：**语义相近 → 向量距离近**。检索时对用户问题向量化，找与之最接近的 chunk 向量（本项目用 **cosine 相似度**）。

### 为什么不把整份 PDF 塞进 prompt？

| 方式 | 问题 |
|------|------|
| 整份 PDF 进 prompt | 超长、超 context 窗口、贵、慢 |
| RAG 只塞 Top-K 相关片段 | 短、相对准、可展示 citation |

---

## 3. 本项目 M4 实现概览

| 环节 | 技术选型 | 说明 |
|------|----------|------|
| PDF 解析 | `pdf-parse` | 提取**文字层**（非 OCR） |
| 分块 | `RecursiveCharacterTextSplitter` | 默认 800 字 / overlap 100 |
| Embedding | **Feature Hashing**（`hashing-local`） | 纯 JS，无 API、无 native 模型文件 |
| 向量库 | 内存 `Map`（`store.ts`） | 按 `sessionId` 隔离，重启丢失 |
| 检索 | cosine Top-K | 默认 `RAG_TOP_K=4` |
| 生成 | DeepSeek V4（Chat API） | OpenAI 兼容协议 |
| 引用 | SSE `citation` + UI `CitationList` | 检索结果结构化推送，非从模型输出解析 |

**New chat 决策 A：** `POST /api/chat/reset` 只清对话记忆（`memory/sessions.ts`），**不删除** PDF 向量（`rag/store.ts`）。

---

## 4. 文件职责与串联逻辑

### 4.1 服务端

| 文件 | 职责 |
|------|------|
| `server/src/index.ts` | HTTP 入口：upload、documents 列表、chat/stream；multer；SSE 写 `citation` |
| `server/src/config.ts` | RAG 环境变量（Top-K、chunk 大小、Embedding 维度等） |
| `server/src/rag/types.ts` | `DocumentMeta`、`SourceCitation`、`UploadResult` 类型 |
| `server/src/rag/embeddings.ts` | `HashingEmbeddings`：文本 → 512 维向量 |
| `server/src/rag/ingest.ts` | PDF → 文本 → chunk → 向量化 → 写入 store |
| `server/src/rag/store.ts` | 内存向量库：入库、列表、cosine 相似度搜索 |
| `server/src/rag/retrieve.ts` | 检索 Top-K → `SourceCitation[]`；`formatContext` 拼 prompt |
| `server/src/chains/chat.ts` | `buildPromptInput` 注入 RAG；LCEL + 多轮记忆 + 流式 |
| `server/src/utils/filename.ts` | 中文 PDF 文件名 UTF-8 修正 |
| `server/src/memory/sessions.ts` | 多轮对话记忆（与 PDF 向量分离） |

### 4.2 客户端

| 文件 | 职责 |
|------|------|
| `client/src/api/documents.ts` | 上传 PDF、拉文档列表 |
| `client/src/api/chat.ts` | SSE 流式；解析 `citation` / `token` / `done` |
| `client/src/hooks/useSendMessage.ts` | 携带 `documentIds` 发消息；`onSources` / `onToken` |
| `client/src/App.tsx` | 上传 UI、文档列表、`CitationList`（回答下方） |

### 4.3 链路 A：上传 PDF（Ingest）

```text
用户选文件
  → App.tsx → api/documents.ts (FormData: file + filename + sessionId)
  → POST /api/documents/upload (index.ts + multer)
  → utils/filename.ts 修正文件名
  → rag/ingest.ts: pdf-parse → splitText → Document[]
  → rag/store.ts: embedDocuments → 存入 chunksBySession
  → registerDocument → 返回 documentId, chunkCount
  → GET /api/documents 刷新列表
```

### 4.4 链路 B：带 RAG 的提问

```text
用户 Send
  → App.tsx (documentIds) → useSendMessage → sendChatStream
  → POST /api/chat/stream (index.ts)
  → chains/chat.ts: buildPromptInput
       → retrieve.ts: retrieveSources
            → store.ts: embedQuery + similaritySearch (Top-K)
       → formatContext → 拼 systemPrompt
  → chainWithHistory.stream → DeepSeek
  → index.ts:
       writeSse citation { sources }   ← 引用（早于 token）
       writeSse token …                ← 回答流式
       writeSse done { sources }
  → chat.ts 解析 → App.tsx: 上为 msg.content，下为 CitationList
```

### 4.5 核心 ID

| ID | 含义 |
|----|------|
| `sessionId` | 一次会话；PDF 向量、对话记忆都挂在此 key 下 |
| `documentId` | 一份 PDF；其所有 chunk 共享同一 documentId |

---

## 5. Embedding 模型

### 5.1 是什么？

**Embedding 模型**把文本变成固定长度的**数字向量**，用于语义相似度检索。RAG 里它负责「找相关段落」，**不负责**生成自然语言回答。

| | Embedding | Chat LLM（DeepSeek） |
|--|-----------|----------------------|
| 输入 | 文本 | 对话 / prompt |
| 输出 | 数字向量 | 自然语言 |
| 本项目用途 | 检索 chunk | 生成回答 |

### 5.2 本项目：`HashingEmbeddings`

- 实现：`server/src/rag/embeddings.ts`
- 配置：`EMBEDDING_MODEL=hashing-local`，`EMBEDDING_DIMENSIONS=512`
- **无独立模型文件**，算法即代码；不调用 Embedding API

**为何不用 DeepSeek Embedding？** DeepSeek 无稳定公开 Embedding API（`/embeddings` 会 404）。

**为何不用本地 transformers（Xenova）？** Apple Silicon + pnpm 下 `sharp` 等 native 依赖易失败；故 demo 阶段改用 Hashing。

### 5.3 常见替代方案

| 类型 | 例子 | 特点 |
|------|------|------|
| 云端 API | OpenAI `text-embedding-3-small`、Cohere | 效果好，按量付费 |
| 本地开源 | BGE、all-MiniLM-L6-v2 | 需下载模型到 `~/.cache/huggingface/` 等 |
| Hashing（当前） | 词 hash → 向量 | 免费、语义能力弱，适合跑通链路 |

---

## 6. Citation（引用）

### 6.1 是什么？

**Citation = 告诉用户「这次回答参考了哪些 PDF 的哪些段落」。**

本项目有**两层**，不要混淆：

| 层级 | 来源 | UI 表现 |
|------|------|---------|
| **系统 citation（主要）** | `retrieveSources` 的 Top-K 检索结果 | 助手气泡**下方**：文件名 + snippet |
| **文内 [1][2]（次要）** | LLM 按 prompt 要求自行书写 | 出现在回答**正文**里，不保证正确 |

**下方引用列表以检索为准**，不是从大模型输出里 regex 解析出来的。

### 6.2 数据结构

```typescript
interface SourceCitation {
  documentId: string;
  filename: string;
  snippet: string;   // 约前 200 字
  score: number;     // cosine 相似度
}
```

### 6.3 时序

```text
1. retrieveSources 完成
2. systemPrompt 已含同一批 excerpt
3. LLM stream 启动
4. SSE event: citation  → 前端可先显示引用
5. SSE event: token    → 上方回答逐字增长
6. SSE event: done      → 再带一遍 sources
```

**UI 布局：** 回答在上（`message__content`），引用在下（`CitationList`）。引用数据往往比第一个 token **更早**到达前端。

### 6.4 一次检索、两个用途

```text
retrieveSources（一次）
    ├─→ formatContext → 拼进 systemPrompt → DeepSeek
    └─→ sources[] → SSE citation → 前端 CitationList
```

传给前端和大模型的都是**文字片段**，**不是向量**。

---

## 7. 传给 DeepSeek 的完整 Prompt 格式

LangChain 使用 **Chat Completions `messages` 数组**，不是单条字符串。

### 7.1 模板结构

```typescript
// server/src/chains/chat.ts
ChatPromptTemplate.fromMessages([
  ['system', '{systemPrompt}'],
  new MessagesPlaceholder('chat_history'),  // M2 多轮记忆
  ['human', '{input}'],
]);
```

| 角色 | 内容 |
|------|------|
| **system** | 人设 + RAG 规则 + `Document excerpts:` + **Top-K 文字** |
| **chat_history** | 历史 user/assistant 轮次（可选） |
| **human / user** | **当前用户问题**（原样，不含 Top-K） |

Top-K **不会**与用户问题拼在同一条字符串里。

### 7.2 Top-K 在 system 中的形式

由 `formatContext` 生成（`retrieve.ts`）：

```text
[1] (文件名.pdf)
第一段 chunk 原文摘要…

[2] (文件名.pdf)
第二段 chunk 原文摘要…
```

完整 `systemPrompt` 结构：

```text
You are a helpful assistant. Answer clearly and concisely in the same language as the user.

Use the provided document excerpts to answer when they are relevant. Cite which excerpt(s) you used by number [1], [2], etc. If the excerpts do not contain the answer, say you cannot find it in the uploaded documents and answer from general knowledge only when appropriate.

Document excerpts:
[1] (技术文档.pdf)
…Top-1 片段文字…

[2] (技术文档.pdf)
…Top-2 片段文字…

（最多 K 条，默认 4）
```

### 7.3 完整请求示例（首轮、Top-3、无历史）

**HTTP body（概念）：**

```json
{
  "model": "deepseek-v4-flash",
  "stream": true,
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant...\n\nDocument excerpts:\n[1] (技术文档.pdf)\nAI Knowledge Chat 是一个 pnpm monorepo...\n\n[2] (技术文档.pdf)\nserver/src/rag/ 负责 PDF 解析...\n\n[3] (技术文档.pdf)\n环境变量放在 server/.env..."
    },
    {
      "role": "user",
      "content": "这个项目用的什么技术栈？"
    }
  ]
}
```

### 7.4 多轮对话示例（第 2 问）

每一轮**新问题都会重新检索**，system 里的 Top-K 随问题更新；history 里只有过往 Q/A，不含 excerpt。

```json
{
  "messages": [
    { "role": "system", "content": "...Document excerpts: [1] ... [2] ..." },
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好！有什么可以帮你的？" },
    { "role": "user", "content": "这个项目用的什么技术栈？" }
  ]
}
```

---

## 8. 费用与存储

### 8.1 什么要付费？

| 组件 | 本项目 | 是否付费 |
|------|--------|----------|
| **Chat（DeepSeek）** | 每次问答调用 | ✅ 按 token 计费 |
| **Embedding** | Hashing 本地 | ❌ |
| **Embedding（若换 OpenAI 等）** | 未接入 | ✅ 按调用计费 |
| PDF 解析、内存存储 | 本地 | ❌ |

**结论：** 有门槛的主要是 **Chat LLM**；Embedding **可以**付费，但当前实现**不付费**。

### 8.2 存在哪里？

| 内容 | 位置 | 重启服务后 |
|------|------|------------|
| Embedding **模型**（Hashing） | 无文件，仅 `embeddings.ts` 代码 | — |
| chunk **向量** + 原文 | `store.ts` 内存 `chunksBySession` | **丢失** |
| 文档元信息 | `store.ts` `documentsById` | **丢失** |
| 对话记忆 | `memory/sessions.ts` | **丢失** |
| DeepSeek API Key | `server/.env` | 保留在文件 |

向量**不传给** DeepSeek 或前端；只在服务端检索时使用。

---

## 9. 环境变量（RAG 相关）

| 变量 | 默认 | 说明 |
|------|------|------|
| `EMBEDDING_MODEL` | `hashing-local` | 本地 Hashing 策略 |
| `EMBEDDING_DIMENSIONS` | `512` | 向量维度 |
| `RAG_TOP_K` | `4` | 检索返回片段数 |
| `RAG_CHUNK_SIZE` | `800` | 分块大小（字符） |
| `RAG_CHUNK_OVERLAP` | `100` | 块间重叠 |
| `UPLOAD_MAX_BYTES` | `10485760` | PDF 上传上限（10MB） |

详见 [TECHNICAL.md §7](./TECHNICAL.md)。

---

## 10. 已知限制

| 限制 | 说明 |
|------|------|
| 内存向量库 | 重启丢失；不适合多实例 |
| Hashing Embedding | 检索质量弱于专业 Embedding API |
| 仅文字层 PDF | 扫描版需 OCR，否则 `PDF contains no extractable text` |
| 无鉴权 | 任何人可上传/提问 |
| 无向量持久化 | 路线图 Phase 2：`add-rag-persistence` |
| 无 RAG 评测 | 路线图 M4.5：`add-rag-eval-harness` |

---

## 11. FAQ（问答沉淀）

### Q1. RAG 整条流程是什么？

上传：PDF → 提取文字 → 切块 → 向量化 → 存 store（入库完成）。  
提问：问题向量化 → 与 store 中 chunk 比相似度 → Top-K 文字进 system prompt → DeepSeek 生成 → 同一批 Top-K 经 SSE 在前端显示为引用。

### Q2. 传给大模型的是向量还是文字？

**文字。** Top-K 是 chunk 原文片段，编为 `[1] (文件名)\n片段` 放在 **system** 里；用户问题在单独的 **user** 消息里。

### Q3. 引用是什么时候给前端的？在回答上面还是下面？

- **时机：** 检索完成后，在 **第一个 token 之前** 发 SSE `citation`（不等模型写完）。
- **布局：** **回答在上，引用在下**（`App.tsx` DOM 顺序）。

### Q4. 引用是模型生成的吗？

**主要不是。** UI 引用来自 `retrieveSources` 检索结果；模型正文里的 `[1][2]` 只是 prompt 引导的可选标注，不保证正确。

### Q5. 检索一次还是两次？

**一次。** `buildPromptInput` 里 `retrieveSources` 的结果同时用于 system prompt 和 SSE citation。

### Q6. Embedding 模型存哪？要付费吗？

当前 Hashing：**无模型文件**，不付费。  
若用 OpenAI Embedding：模型在云端，按 API 付费，本地不存权重。  
若用本地 HF 模型：权重在 `~/.cache/huggingface/` 等。  
**算出来的向量**存在 `store.ts` **内存**，不在磁盘。

### Q7. 只有 Embedding 要付费吗？

**不是。** 当前 **DeepSeek Chat 每次提问都付费**；Embedding 用 Hashing **不付费**。

### Q8. 「文字识别」和本项目 PDF 解析一样吗？

不一样。本项目是 **文本提取**（`pdf-parse` 读 PDF 文字层），不是 OCR 扫描识别。

### Q9. New chat 后 PDF 还能用吗？

**决策 A：** New chat 只清 **对话记忆**；**同一 sessionId** 下 PDF 向量仍在服务端。若生成新 sessionId，需重新上传或沿用原 sessionId。

### Q10. 中文 PDF 文件名乱码怎么办？

客户端 `FormData` 显式传 `filename`；服务端 `utils/filename.ts` 做 Latin-1 → UTF-8 兜底。已上传且已乱码的需重新上传。

---

## 12. 路线图中的 RAG 延伸

| 阶段 | Change | 内容 |
|------|--------|------|
| 收尾 | archive `add-rag-pdf-chat` | delta 合并进 baseline spec |
| M4.5 | `add-rag-eval-harness` | 固定 PDF + cases.json + citation 断言 |
| 质量 | `add-rag-quality`（规划） | 可切换 OpenAI Embedding、Rerank |
| 持久化 | `add-rag-persistence`（规划） | SQLite 存向量，重启不丢 |
| M5 | `add-api-test-harness` | mock LLM，测 upload/SSE/citation 契约 |

---

## 13. 相关代码索引

| 步骤 | 文件 | 函数/路由 |
|------|------|-----------|
| 上传 | `index.ts` | `POST /api/documents/upload` |
| 入库 | `ingest.ts` | `ingestPdf` |
| 向量化 | `embeddings.ts` | `getEmbeddings` |
| 存储/搜索 | `store.ts` | `addDocumentsToSession`, `similaritySearch` |
| 检索 | `retrieve.ts` | `retrieveSources`, `formatContext` |
| 拼 prompt | `chains/chat.ts` | `buildPromptInput` |
| 发 SSE | `index.ts` | `writeSse('citation'|'token'|'done')` |
| 前端引用 | `App.tsx` | `CitationList` |

---

## 14. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-05-24 | 初版：汇总 M4 RAG 原理、实现链路、DeepSeek prompt 格式、FAQ |
| 2026-05-24 | 文件重命名为 `RAG.TECHNOLOGY.md`（L2 专题：`域.主题.md`） |
