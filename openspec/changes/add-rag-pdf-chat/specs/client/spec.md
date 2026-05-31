# Delta: Client (RAG)

## ADDED Requirements

### Requirement: PDF Upload UI

系统 MUST 提供 PDF 上传入口，支持选择文件并显示上传/处理状态。

#### Scenario: 上传成功

- GIVEN 用户选择有效 PDF 文件
- WHEN 上传完成且服务端 ingest 成功
- THEN UI 显示文档名称及可用状态
- AND 后续发送的消息关联该文档（或用户所选文档集）

---

### Requirement: Citation Display

系统 MUST 在 assistant 消息区域展示引用来源列表。

#### Scenario: 展示引用

- GIVEN 流式响应结束且包含 `sources`
- WHEN UI 渲染该条 assistant 消息
- THEN 用户可见文件名、页码（若有）、摘要片段
