# OpenSpec 工作流

本项目使用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 做 **Spec 驱动开发（SDD）**。

## 已定策略

| 项 | 选择 |
|----|------|
| Spec 语言 | **B 英头中文**：`Requirement` / `Scenario` / GIVEN-WHEN-THEN 英文；行为描述中文 |
| M4 | **全栈 RAG**：PDF 后端 + 上传 UI + 引用来源 |
| 流程 | **A 严格 propose**：M4 起新 feat 必须先 propose，确认后再 apply |

## 目录说明

```text
openspec/
├── specs/              # 当前系统行为（source of truth）
├── changes/            # 进行中的变更
│   └── <change-name>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── specs/      # Delta specs
└── config.yaml

docs/TECHNICAL.md       # 架构与调用链（人读）
docs/RAG.TECHNOLOGY.md  # RAG 专题（原理、实现、FAQ）
docs/SPECTECHNICAL.md   # Spec 机制、合并规则、FAQ（与 TECHNICAL 同级）
docs/OPENSPEC.md          # 本文件（流程）
```

## Cursor 命令（需本机安装 CLI 后 `openspec init` 可补全技能）

```bash
npm install -g @fission-ai/openspec@latest
cd AI-knowledge-chat
openspec init   # 选择 Cursor，生成 slash commands
```

| 命令 | 用途 |
|------|------|
| `/opsx:propose <name>` | 创建 change：proposal + design + tasks + delta specs |
| `/opsx:apply` | 按 tasks 实现 |
| `/opsx:archive` | 合并 delta 到 `openspec/specs/`，归档 change |

## 必须 propose 的场景（M4 起）

- 新 milestone（M4、M5…）
- 新增/修改 API
- 跨 `client` + `server`
- 环境变量、安全、LangChain chain 行为变更

## 允许跳过 propose

- 纯 typo / 注释
- 仅 `docs/` 非 spec 排版
- patch 依赖升级（无行为变化）

## 变更顺序（建议）

1. `baseline-m1-m3-specs` — 已写入 `openspec/specs/`（回填现状）
2. `add-rag-pdf-chat` — M4 功能（审阅后 apply）
3. `add-rag-eval-harness` — M4 archive 后，RAG 评测
4. `add-api-test-harness` — M5，自动化测试

## 与 Harness 的关系

| 类型 | OpenSpec change | 时机 |
|------|-----------------|------|
| RAG 评测 | `add-rag-eval-harness` | M4 完成后 |
| 自动化测试 | `add-api-test-harness` | M5 |

> 合并规则与 FAQ 详见 [SPECTECHNICAL.md](./SPECTECHNICAL.md)。
