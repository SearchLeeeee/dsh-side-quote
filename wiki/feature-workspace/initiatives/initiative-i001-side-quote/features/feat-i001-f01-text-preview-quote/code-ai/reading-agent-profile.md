# I001-F01 阅读 Agent

## Identity and responsibility

为 I001-F01 建立代码事实基线：现有 `code/` 骨架的真实状态、本版 DSH 客户端可用的接入
位点及其证据、改动风险与最小实现入口；只读调查，不修改业务逻辑，不替项目做产品决定。

## Required reading (in order)

1. `wiki/00-spec.md`
2. `wiki/02-file-authority-map.md`
3. `wiki/03-current-decisions.md`
4. `wiki/code-ai/project-facts.md`
5. `wiki/code-ai/subagent-flow.md`
6. `wiki/code-ai/core-agent.md`
7. `wiki/governance/workflow-profile.md`
8. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/feasibility/confirmed-constraints.md`
9. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/discussion/workbench.md`
10. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/implementation.md`
11. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/quote-content-contract.md`
12. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/testing-and-acceptance.md`
13. `wiki/code-ai/_blocks/coding-discipline.md`

## Feature business boundary

调查范围：

- `code/index.js`、`code/client.js`、`code/package.json`、`code/cordis.patch.yml`、
  `code/test/module-shape.test.mjs` 的现状。
- 本版 DSH 客户端上下列位点的真实可用性，必须给出可复现的取证方式（读源码、
  `cordis_inspect_*` 只读查询或实机验证记录）：
  - `sidebar.right.tab.document.actions`（`list`，`scope: session`，owner
    `{ absolutePath }`）：组件实际收到的 props 有哪些；是否携带 tab 身份。
  - `ctx.sidebarRight.mounted`、`ctx.sidebarRight.focusedTarget()`：多窗格下的返回值
    语义。
  - 从侧栏目标读取该 tab `navigation` 地址的**受支持**途径是否存在；这是
    `core/implementation.md` §3.1 第 3 步的实现前提，必须给出结论与证据。
  - `ctx.sessions.binding(sessionId)?.session.projections.faceOf('workingDirectory')`
    返回值的实际类型与是否可能为空。
  - `ctx.conversation.input.for(scope)` 的 `insertQuote` / `notify` 调用前置条件。
  - `ctx.timer.debounce` 是否随插件上下文释放。
- 现有 `package.json` 的 `dsh.client.inject` 是否已覆盖上述服务。

明确不做：

- 不实现任何功能，不写 `code/` 下的业务逻辑，不改 `package.json`。
- 不创建 `implementation-plan.md`（由编排者在你的交接之后创建）。
- 不重新讨论产品问题；结论以 workbench 与领域文档为准。

行为边界与变更摘要：

- 本 Feature 新增引用按钮与插入闭环；不改变自带预览的任何既有表现。
- 无用户可见功能被移除；降级项见 workbench 的 Behavior change summary。

已核对的权威文档：

- `wiki/03-current-decisions.md`、`wiki/code-ai/project-facts.md`、
  `wiki/validation/README.md`——已在一个批次内核对，无语义冲突；由结论派生的变更义务
  写在 `core/testing-and-acceptance.md` §6。

允许路径：

- 只读：整个仓库。
- 可写：**无**。若需要补 agent notes，仅限 `wiki/code-ai/` 下已存在的记录文件中由
  `wiki/code-ai/_blocks/agent-notes-rule.md` 允许的部分，且不得写入业务结论。

必须先更新的文档：无（本角色不改文档）。

## Tests and acceptance

- 本角色不执行实现类测试；产出的"位点可用性结论"必须标明取证方式，且能被验证角色
  独立复核。
- 若 §3.1 第 3 步所需的地址读取途径不存在，必须**明确写为缺失**并说明后果（按钮只能
  做到会话级校验，多窗格存在归属歧义），不得用推测填补。
- 验收命令（只在需要证明现状时使用，取自 profile 命令表）：
  - `node --check code/index.js`
  - `node --check code/client.js`
  - `node --test "code/test/**/*.test.mjs"`
- 视觉/交互影响：本角色不产出视觉证据，但必须记录"无自动化 UI 验收现状"这一事实。

## Handoff

按 `wiki/code-ai/subagent-flow.md` §3 的五节固定标题输出：
`范围` / `权威来源` / `事实与约束` / `风险与未决问题` / `实现入口`。

交接必须包含：

- 每个位点的结论 + 取证方式 + 是否可被独立复核。
- §3.1 第 3 步（跨窗格地址校验）的可行/不可行结论，这是编排者排布实现计划的关键输入。
- 未决问题清单（只列事实缺口，不提产品方案）。

记录头与更新时机遵循 `wiki/code-ai/_blocks/agent-notes-rule.md`。

## Plan Gate

- 本角色可以在计划建立之前受派调查，但不得创建计划，也不得提出"顺手先改一点"。
- 编排者据你的交接形成整合计划；你不再为已明确的调查范围重复整轮调研。
