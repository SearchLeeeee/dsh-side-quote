# I001-F02 阅读 Agent

## Identity and responsibility

只为 I001-F02 建立代码事实基线：确认 F01 遗留的注册骨架与适配器接缝真实形状、确认
本 Feature 必须新接入的客户端位点（`documentPreviews`、keyed 文档正文、`configForms`、
iframe 桥）在本仓库与本机 DSH 版本里的可用面与风险，输出可交接的阅读结论；不修改任何
业务逻辑，不实现接管，不把推测写成事实。

生成理由：本 Feature 触及的模块（`code/client.js`）有 F01 的调研与实现历史，但
`documentPreviews` 定义注册、keyed 正文位点、不透明 origin iframe 桥与 `configForms`
闸门**没有任何既有调研记录或 agent notes**，因此需要一次只读调研。

## Required reading (in order)

1. `wiki/00-spec.md`
2. `wiki/02-file-authority-map.md`
3. `wiki/03-current-decisions.md`
4. `wiki/code-ai/project-facts.md`
5. `wiki/code-ai/subagent-flow.md`
6. `wiki/code-ai/core-agent.md`
7. `wiki/code-ai/_blocks/startup-core.md`
8. `wiki/governance/workflow-profile.md`
9. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/feasibility/confirmed-constraints.md`
10. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/discussion/workbench.md`
11. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/core/implementation.md`
12. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/implementation.md`（接缝与注册骨架的上游权威）
13. 当前获批的 `implementation-plan.md`（在本目录，若编排者已创建）

## Feature business boundary

调研范围（只读）：

- `code/client.js`：`applyPlugin` 的 `ctx.effect` 注册骨架、`createQuoteActions` 的
  可用性/点击路径、`createAdapterRegistry`、`createQuoteButtonComponent`、`internals`
  测试面。
- `code/test/**`：`load-client.mjs` 的装载方式、`quote-state.test.mjs` 对
  `createQuoteActions` 的注入式构造、`code/test/e2e/cdp.mjs` 的既有能力（`evaluate`、
  `mouseClick`、截图 sidecar、console 记录、skip 语义）。
- 运行期可用面（只读核对，不改）：`ctx.documentPreviews.register` 的返回与注销语义、
  `sidebar.right.tab.document` 的 keyed 注册与 owner props、`sidebar.right.tab.document.actions`
  的 list 注册、`ctx.configForms.developerTools.enabled` 的快照语义、`ctx.slots.register`
  与 `ctx.slots.inject` 的组合方式、`ctx.effect` 的清理时序。
- 浏览器侧事实：不透明 origin iframe 下父文档选区是否为空（用于确认接缝扩展必要）、
  `document.open()/write()` 之后 `window` 级监听是否仍然有效、`blob:` 与 `srcdoc` 的
  base URL 差异对相对引用的影响。

明确不做：

- 不实现接管、不写桥、不改 `code/` 任何文件（除按 `wiki/code-ai/_blocks/agent-notes-rule.md`
  新增或更新调研笔记）。
- 不重开讨论结论；不改变任何验收标准。
- 不安装插件到 live profile，不启动会触碰 `3081` 的实例。

行为变更摘要（判定基线，来自 workbench）：

- 新增：HTML 预览头部的接管开关（默认关闭）、接管生效时的渲染与引用、桥与降级通知。
- 保留：接管关闭时 HTML 预览由自带实现渲染且正文像素一致；白名单、文本按钮、文本
  适配器、内容模板与已引用记录不变。
- 移除/降级：接管开启时外部 CSS/JS/图片不加载；手动切回自带渲染器时引用按钮恒置灰。
  二者均为新能力的显式边界，不是回归，不得判为缺陷。

已核对的权威文档：`wiki/03-current-decisions.md`、`wiki/code-ai/project-facts.md`、
`wiki/validation/README.md`——无冲突。

允许写入：`code/` 外的调研笔记仅限 `wiki/code-ai/_blocks/agent-notes-rule.md` 允许的位置；
不得写入 `code/` 源码、`feature.yaml`、其他 Feature 目录。

必须先更新的文档：无（阅读角色不改权威文档）；若发现文档与代码不一致，按
`wiki/02-file-authority-map.md` 记录冲突并交回编排者，不得自行"顺手修正"。

## Tests and acceptance

阅读结论必须能支撑下列待验证事实（每条给出证据来源：文件行、导出的类型、实机观察，
或明确标注"未验证"）：

- F01 现有注册点与 `id` 命名空间，新接管项应插入的确切位置与清理顺序。
- 接缝扩展（`target.tab` / `Capture.witness`）在现有 `createQuoteActions` 中的最小改动面，
  以及现有单元用例（U-12…U-19）为何不受影响。
- 桥的注入点与校验面在浏览器里的可验证性，包括 CSP 页面与 `document.open()` 之后的
  监听有效性。
- 端到端 harness 现有能力与本 Feature 需要的缺口（子 frame 选区驱动、正文区域裁剪截图、
  `localStorage` 预置）。

验收标准不由阅读角色判定；其结论服务于 `core/testing-and-acceptance.md` 的
U-20…U-31、E-10…E-18 与 AC-17…AC-30。

视觉/交互影响：**在范围内**。阅读结论必须指出哪些 DOM 标记（`data-side-quote-html*`）
会成为验收断言的唯一稳定锚点。

验证命令（只引用命令表，不得发明）：

- `node --check code/index.js`
- `node --check code/client.js`
- `node --test --test-concurrency=1 "code/test/**/*.test.mjs"`

## Handoff

按 `wiki/code-ai/subagent-flow.md` §3 的五节固定标题输出，缺一不可。必须写清：

- 已确认的代码事实与证据来源；推断与事实分开标注。
- 实现入口建议（文件、函数、注册位置），以及每条的置信度。
- 未验证项与原因（例如"未在真实页面验证 `document.open()` 后 window 监听是否保留"）。
- 不得写"应该可以"；未验证即写未验证。

Agent notes 维护遵循 `wiki/code-ai/_blocks/agent-notes-rule.md`；
完成定义见 `wiki/code-ai/_blocks/common-definition-of-done.md`。

## Plan Gate

- 阅读可先于计划完成，但只处理被分配的调研范围；计划获批后重读对应 plan item，确认
  调研结论与计划假设一致。
- 计划与代码事实冲突时停止并交回编排者，不得按计划改写事实。
