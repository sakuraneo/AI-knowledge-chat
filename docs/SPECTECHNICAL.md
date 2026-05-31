# Spec 技术文档

本文档与 [TECHNICAL.md](./TECHNICAL.md) **同级**：TECHNICAL 讲架构与调用链（人读叙事）；本文档讲 **OpenSpec / spec 的技术规则、合并机制、FAQ 沉淀**。

> **阅读指引**
> - 想懂项目怎么跑 → [TECHNICAL.md](./TECHNICAL.md)
> - 想验收 / 改行为 → [openspec/specs/](../openspec/specs/)（各 spec 顶部有 30 秒摘要）
> - 想走 propose / apply / archive 流程 → [OPENSPEC.md](./OPENSPEC.md)
> - 想搞清 spec 是什么、delta 怎么合并 → **本文档**

---

## 1. 文档分工

| 文档 | 层级 | 内容 | 主要读者 |
|------|------|------|----------|
| [TECHNICAL.md](./TECHNICAL.md) | 架构 | Monorepo、全栈六阶段、API、状态模型 | 人（学习 / 面试 / onboarding） |
| [SPECTECHNICAL.md](./SPECTECHNICAL.md) | Spec 机制 | 合并规则、目录语义、FAQ | 人 + AI（实现 / Review 前查阅） |
| [OPENSPEC.md](./OPENSPEC.md) | 流程 | propose → apply → archive、何时必须 propose | 人 + AI |
| `openspec/specs/` | 行为契约 | 当前系统 **必须** 怎样（Requirement + Scenario） | 人验收 + AI apply |
| `openspec/changes/` | 变更包 | 进行中功能的 proposal / design / tasks / delta | 人决策 + AI apply |
| Git history | 代码历史 | 每一版代码 diff | 所有人 |

```text
TECHNICAL.md      = 怎么连起来的、为什么（叙事）
spec.md           = 什么算对、什么算错（合同 / 验收清单）
changes/          = 这次打算改什么（工单包，做完 archive）
SPECTECHNICAL.md  = spec 体系本身的规则与 FAQ（本文档）
```

### 1.1 为什么在本项目引入 OpenSpec？

| 现状 | OpenSpec 补什么 |
|------|-----------------|
| `TECHNICAL.md` 偏架构与调用链 | `openspec/specs/` 偏**可验收的行为需求**（Scenario） |
| M1–M3 在对话中演进，缺少需求源 | 已实现能力沉淀为 **source of truth** |
| M4 RAG 跨前后端、复杂 | **change 包**先 plan 再 code |
| 改代码前习惯先确认 | propose → 审阅 → apply 与习惯一致 |

OpenSpec 擅长 **brownfield（改现有系统）**：用 delta 描述「相对现状改什么」，而不是从零重写文档。

---

## 2. `spec.md` 是给谁看的？

**既给人，也给 AI——但不是「只给 AI 的隐藏配置」。**

| 角色 | 怎么用 spec |
|------|-------------|
| **AI** | `/opsx:apply` 或「按 spec 实现」时，作为边界与验收清单，减少漏做、擅自改行为 |
| **人** | Code Review、手动验收时，逐条勾 Scenario |
| **自动化** | **不会自动执行**；M5 test harness 可把部分 Scenario 落成测试（需额外建设） |

### 2.1 Spec 不会自动检查代码

| 环节 | 是否自动 |
|------|----------|
| 读 spec → 写代码 | 靠流程与 prompt，非强制 |
| 对照 spec 验收 | 默认手动 |
| 单元测试 / CI | M5 `add-api-test-harness` 规划项，非 spec 自带 |

```text
spec.md     = 合同（应该做什么）
代码        = 交付物
测试 / eval = 验货机器（可选，另外建）
```

### 2.2 为什么 spec 读起来「不好懂」？

- 格式是 **BDD 契约**（`Requirement` / `GIVEN-WHEN-THEN`），像测试用例，不像教程。
- 本项目 **B 英头中文**：标题英文便于 AI 解析，正文中文描述行为。
- 按域拆分（chat / memory / client / config），没有一条从 UI 到 DB 的故事线——故事线在 TECHNICAL §3。

**每个 baseline spec 顶部的「30 秒摘要」** 为人读白话；其下的 Requirement / Scenario 为可验收契约。

---

## 3. 目录语义：`specs/` vs `changes/` vs `archive/`

```text
openspec/
├── specs/                    # 当前系统行为（source of truth，随 archive 更新）
├── changes/
│   ├── <change-name>/        # 进行中的变更包
│   │   ├── proposal.md       # 为什么做、做什么、影响
│   │   ├── design.md         # 技术方案与取舍
│   │   ├── tasks.md          # 实现 checklist（Phase）
│   │   └── specs/            # Delta specs（相对 baseline 的增量）
│   └── archive/              # 已完成变更的档案袋（整包保留，不删）
└── config.yaml
```

| 目录 | 含义 | 时机 |
|------|------|------|
| `openspec/specs/` | 系统**现在**应该怎样 | 始终代表当前真相 |
| `openspec/changes/<name>/` | **计划**怎样改 | propose 到 archive 之前 |
| `openspec/changes/archive/<date>-<name>/` | 某次变更的完整档案 | archive 之后 |

### 3.1 Change 包内各文件职责

| 文件 | 作用 | 谁主要看 |
|------|------|----------|
| `proposal.md` | Why / What / Impact / Phases / Approval | 人（决策） |
| `design.md` | 技术选型、API sketch、Open Questions | 人 + AI apply |
| `tasks.md` | 可勾选实现步骤 | AI apply + 人验收 |
| `specs/**/*.md` | 行为 **delta**（ADDED 等） | AI apply + archive 合并 |

### 3.2 `changes/` 不是 Git 历史

- **Git**：记录代码每一版 diff。
- **OpenSpec changes**：记录「为什么做、设计方案、任务清单、行为 delta」。
- Archive 后 change **不会清空删除**，而是 **整包移到 `changes/archive/`**，proposal / design / tasks / 原 delta 均保留。

### 3.3 进行中 change 与 baseline 同时存在时怎么读？

以 M4 为例（archive 前）：

| 位置 | 内容 |
|------|------|
| `openspec/specs/chat/spec.md` | 仅 M1–M3（**当前真相**） |
| `openspec/changes/add-rag-pdf-chat/specs/chat/spec.md` | 仅 **ADDED** RAG Requirement（**计划增量**） |

**验收 M4 代码**：baseline + delta 一起看，或等 archive 后只看合并后的 `specs/`。

---

## 4. 生命周期：propose → apply → archive

```text
① propose   创建 changes/<name>/（proposal + design + tasks + delta specs）
② review    人审阅；明确回复「可以」后再 apply（本项目约定）
③ apply     按 tasks.md 写代码（可分批 Phase）
④ verify    对照 delta Scenario 手动 / 测试验收
⑤ archive   合并 delta → openspec/specs/；移动 change → changes/archive/
```

| 命令 / 动作 | 作用 |
|-------------|------|
| `/opsx:propose` | 创建 change 包 |
| `/opsx:apply` | 按 tasks 实现 |
| `/opsx:sync`（可选） | 开发中途把 delta 同步进主 spec，**不** archive、**不** 移动 change |
| `/opsx:archive` 或 `openspec archive` | 合并 delta + 归档 change |
| `openspec init` | 生成 Cursor slash commands（目录可手建，见 Q15） |

### 4.1 `/opsx:sync` 与 `/opsx:archive` 的区别

| | sync | archive |
|--|------|---------|
| 合并 delta 到 `specs/` | 可以 | 必须 |
| 移动 change 到 `archive/` | 否 | 是 |
| change 是否还算「进行中」 | 是 | 否（已完结） |
| 典型场景 | 长跑 change、中途让 baseline 与实现一致 | 功能完成并验收后 |

---

## 5. Delta 合并规则（Archive 核心）

Delta 文件位于 `openspec/changes/<name>/specs/<domain>/spec.md`，使用以下 **四种操作标记**：

| 标记 | 含义 | 合并到 `openspec/specs/` 时的动作 |
|------|------|-----------------------------------|
| **ADDED** | 新增 Requirement | 追加到对应 domain 的 `## Requirements` 区域末尾 |
| **MODIFIED** | 修改已有 Requirement | 按 **Requirement 标题** 定位旧块，**整段替换**（含全部 Scenario） |
| **REMOVED** | 删除 Requirement | 从主 spec 删除该 Requirement 整块 |
| **RENAMED** | Requirement 改名 | 先按旧标题定位并改名，再按需执行 MODIFIED |

### 5.1 合并原则

1. **按 Requirement 标题匹配**，不是按行号或模糊 diff。
2. **MODIFIED 必须整段替换**：delta 里是该 Requirement 的**完整新文本**，禁止只改一半 Scenario。
3. **ADDED** 去掉 delta 文件中的 `## ADDED Requirements` 标题后，将各 Requirement 块并入主 spec。
4. 若 delta 涉及新 domain（如未来 `openspec/specs/eval/`），archive 时可 **新建** 对应 `spec.md`。
5. 合并后应更新主 spec 的 **30 秒摘要** 与 **Milestone Alignment**（若该 milestone 已落地）。

### 5.2 示例：M4 `add-rag-pdf-chat` 合并 `chat` delta

**合并前** — `openspec/specs/chat/spec.md` 仅含 M1–M3（无 RAG）。

**Delta** — `openspec/changes/add-rag-pdf-chat/specs/chat/spec.md`：

```markdown
## ADDED Requirements

### Requirement: RAG-Aware Streaming Chat
...Scenarios...
```

**合并后** — 在 `openspec/specs/chat/spec.md` 的 Requirements 区 **追加**：

```markdown
### Requirement: RAG-Aware Streaming Chat
...Scenarios（来自 delta，原样迁入）...
```

**Client delta** 同理：`PDF Upload UI`、`Citation Display` → 并入 `openspec/specs/client/spec.md`。

### 5.3 Archive 后目录变化

```text
archive 前：
  openspec/specs/chat/spec.md              ← 无 RAG
  openspec/changes/add-rag-pdf-chat/       ← 活跃 change

archive 后：
  openspec/specs/chat/spec.md              ← 已含 RAG Requirement
  openspec/changes/add-rag-pdf-chat/       ← 不存在（已搬走）
  openspec/changes/archive/2026-xx-xx-add-rag-pdf-chat/  ← 整包保留
```

### 5.4 合并方式

| 方式 | 说明 |
|------|------|
| **CLI** | `openspec archive <change-id>` 或 `/opsx:archive`，按上述规则程序化合并 |
| **手动 / AI** | 未装 CLI 时，人工编辑 `openspec/specs/`，效果等价，需在 commit message 中说明 archive |

---

## 6. 与传统开发的关系

传统项目**通常没有** `openspec/specs/` 这种目录，但**不等于没有规格**：

| 传统做法 | OpenSpec 对应物 |
|----------|-----------------|
| PRD / 需求文档 | `proposal.md` |
| 技术方案 / 设计评审 | `design.md` |
| 任务拆分 | `tasks.md` |
| 验收标准 / User Story AC | `Requirement` + `Scenario` |
| API 文档（OpenAPI） | `chat/spec.md` 等 domain spec |

OpenSpec 的差异：**结构化、目录固定、delta + archive 闭环、便于 AI 读取**。

---

## 7. 本项目 Spec 约定（已定决策）

| 决策项 | 选择 | 含义 |
|--------|------|------|
| Spec 语言 | **B 英头中文** | `Requirement` / `Scenario` / GIVEN-WHEN-THEN 英文；行为描述中文 |
| M4 范围 | **B 全栈** | PDF RAG 后端 + 上传 UI + 引用来源 |
| 流程严格度 | **A 严格 propose** | M4 起 feat 须先 change，用户确认「可以」后再 apply |
| Baseline | M1–M3 回填 | 直接写入 `openspec/specs/`，未走 change（ brownfield 回填） |
| 人读摘要 | 30 秒摘要 | 每个 baseline spec 顶部；TECHNICAL §10 互链 |

### 7.1 B 英头中文写法示例

```markdown
### Requirement: Streaming Chat Response
系统 MUST 通过 `POST /api/chat/stream` 以 SSE 逐 token 返回 assistant 回复。

#### Scenario: 正常流式输出
- GIVEN 客户端发送有效 `message` 与可选 `sessionId`
- WHEN 服务端处理流式请求
- THEN 依次发送 `session`、`token`、`done` 事件
- AND 客户端逐字更新 assistant 气泡内容
```

- **英文：** 标题、固定关键词（Requirement / Scenario / GIVEN / WHEN / THEN / AND）
- **中文：** 行为描述、业务含义、验收细节

### 7.2 四个 Spec Domain

| Domain | 文件 | 主要职责 |
|--------|------|----------|
| chat | `openspec/specs/chat/spec.md` | HTTP API、LCEL、SSE |
| memory | `openspec/specs/memory/spec.md` | Session、RunnableWithMessageHistory、reset |
| client | `openspec/specs/client/spec.md` | UI、TanStack Query、SSE 客户端、Vite 代理 |
| config | `openspec/specs/config/spec.md` | monorepo、`.env`、DeepSeek、已知限制 |

### 7.3 何时必须 propose / 何时可跳过

**必须 propose（M4 起）：** 新 milestone、新增/改 API、跨 client+server、环境变量与 chain 行为变更。

**可跳过：** 纯 typo/注释、仅 `docs/` 排版、无行为变化的 patch 依赖升级。详见 [OPENSPEC.md](./OPENSPEC.md)。

### 7.4 Git Commit 与 Spec

| 变更类型 | Commit 前缀 | 示例 |
|----------|-------------|------|
| 仅 spec / 文档 / OpenSpec | `docs:` | `docs(openspec): add M1–M3 baseline specs` |
| OpenSpec 配置 | `chore(openspec):` | `chore(openspec): add config.yaml` |
| 按 spec 实现功能 | `feat:` | `feat(rag): add PDF upload on server` |

**Spec 先写、代码后做** → `docs:`；**按 spec 交付功能** → `feat:`。

---

## 8. M1–M3 与 Baseline Spec 覆盖范围

Baseline 按 **域** 拆分，不按 M1/M2/M3 分文件；各 spec 内 **Milestone Alignment** 表与 [TECHNICAL.md §10](./TECHNICAL.md#10-里程碑路线图学习用) 互链。

### 8.1 里程碑 ↔ Spec 对照

| 里程碑 | 能力 | Spec 文件 |
|--------|------|-----------|
| **M1** | health、非流式 chat、LCEL、聊天 UI 骨架、QueryClient、Vite 代理、monorepo、`.env` | chat、client、config |
| **M2** | 服务端记忆、reset、sessionStorage、乐观更新、New chat | memory、client |
| **M3** | SSE stream、粘包解析、逐 token UI、pending 禁用 | chat、client |

### 8.2 已写入 Spec 的扩展项（相对最初 baseline）

后续已从 TECHNICAL 对齐补入：LCEL 链结构、非流式 **500**、Express JSON/CORS、RunnableWithMessageHistory 细节、空 assistant 气泡、三条状态线、Dev API Proxy、Known Limitations 等。

### 8.3 有意不单独立 Requirement 的内容

以下仍在 **TECHNICAL.md** 叙事，不强制每条进 spec：

- Monorepo 目录树细节（config spec 已覆盖 workspace 行为）
- LangChain 教学性原理长文
- 面试向 monorepo 延伸（非行为契约）

若需可新增 `platform` domain；当前四域已覆盖可验收行为。

---

## 9. Harness 与 Spec 的关系

**Harness 不是 OpenSpec 内置概念**，本项目指两类独立能力：

| | Test Harness | RAG Eval Harness |
|--|--------------|------------------|
| **问什么** | 接口/代码**对不对** | AI 回答**好不好** |
| **OpenSpec change** | `add-api-test-harness`（M5） | `add-rag-eval-harness`（M4.5） |
| **时机** | M4 archive 后或 M5 | **M4 archive 之后** |
| **与 spec** | 可把 Scenario 落成自动化断言 | 不测 spec 语法，测 RAG 质量 |

**Agent Harness**（OpenHarness 等）指 LLM 外层执行框架；本项目是普通 Web 应用，用 Cursor 作 agent，**不在仓库内再建 agent harness**。

---

## 10. FAQ 沉淀

> Spec 相关问答结论；有新问题确认后追加于此。

### Q1：`spec.md` 是不是给 AI 设边界，AI 会自动对照检查？

见 **§2**。是边界与验收清单，**不会自动跑检查**；自动化依赖 M5 测试或人工勾选 Scenario。

### Q2：`changes/` 是不是每一步变更的历史？

**不完全是。** 进行中变更包；Git 记代码 diff；**`changes/archive/`** 记已完成变更档案。

### Q3：Archive 后 `changes/` 会被清空吗？

**不会删除。** 整包移至 `openspec/changes/archive/<date>-<change-name>/`；真相合并进 `openspec/specs/`。

### Q4：Delta 怎么合进 `specs/`？

见 **§5**。ADDED / MODIFIED / REMOVED / RENAMED；MODIFIED 整段替换。

### Q5：传统手工开发是不是没有 spec？

见 **§6**。有 PRD、验收标准等，少 OpenSpec 这种结构化目录与 archive 闭环。

### Q6：OpenSpec 相关 commit 用 `docs` 还是 `feat`？

见 **§7.4**。纯 spec/文档 → **`docs:`**；实现功能 → **`feat:`**。

### Q7：Baseline spec 和 TECHNICAL 里程碑如何对应？

见 **§8**。按域拆分 + Milestone Alignment 表 + TECHNICAL §10 互链。

### Q8：M1–M3 是否都包括在 spec 里？

见 **§8**。用户可见能力已覆盖；部分工程叙事仅在 TECHNICAL。

### Q9：为什么引入 OpenSpec？和 TECHNICAL 分工？

见 **§1.1**。TECHNICAL = 叙事；spec = 可验收契约；changes = 变更包。

### Q10：Baseline 语言 / M4 范围 / 流程严格度选了什么？

见 **§7** 已定决策表：**B 英头中文 + B 全栈 M4 + A 严格 propose**。

### Q11：Harness 是什么？何时加？

见 **§9**。Test → M5；RAG Eval → M4 archive 后（M4.5）。

### Q12：`openspec init` 卡住怎么办？

CLI 可能因未安装、等交互选 IDE、网络而挂起。本项目 **已手建** `openspec/` 树与 `docs/OPENSPEC.md`，**可跳过 init**。若要 `/opsx:*` slash commands，再执行：

```bash
npm install -g @fission-ai/openspec@latest
cd AI-knowledge-chat && openspec init
```

### Q13：M4 现在可以开始吗？还缺什么？

**文档前置已就绪**（baseline + M4 change 草案）。**代码 implement** 需：

1. 审阅 `proposal.md` / `design.md` / `tasks.md`
2. 用户明确回复「可以，做 M4 Phase x」
3. 建议先定 design Open Questions：
   - **Embedding**：推荐 DeepSeek 官方 embedding + 现有 `baseURL` 模式
   - **New chat 与文档**：推荐 New chat **只清对话记忆，不删**已 upload 的向量（per-session 文档保留）

### Q14：30 秒摘要是什么？为什么加？

baseline spec 顶部的 **人读白话**（2–3 段），说明该文件管什么、与 TECHNICAL 关系；其下 Requirement 仍为机器/验收友好格式。因用户反馈「单独读 spec 不直观」而加。

### Q15：Baseline 回填和走 change 流程有什么区别？

| | M1–M3 baseline | M4+ change |
|--|----------------|------------|
| 写入方式 | 直接 `openspec/specs/` | 先 `changes/<name>/specs/` delta |
| 时机 | 代码已存在，补文档 | 先 propose，再 apply 代码 |
| 合并 | 无需 archive | 完成后 archive 进 `specs/` |

### Q16：`/opsx:sync` 和 archive 差别？

见 **§4.1**。sync 只合并不归档；archive 合并并移入 `archive/`。

---

## 11. 变更记录

| 日期 | 内容 |
|------|------|
| 2026-05-24 | 初版 `spectechnical.md`：文档分工、delta 合并、archive、FAQ Q1–Q7 |
| 2026-05-24 | 重命名为 `SPECTECHNICAL.md`；补全 OpenSpec 接入决策、harness、M1–M3 覆盖、init CLI、M4 前置、change 文件职责、sync vs archive 等 FAQ Q8–Q16 |
