# I001-F02 核心（core）实现 Agent

## Identity and responsibility

在 I001-F02 获批的计划项范围内，实现 HTML 预览接管（定义与正文注册、头部开关与引用
按钮变体、不透明 origin iframe 桥、脚本闸门状态机、适配器接缝扩展）及其单元测试；只改
`code/` 下被分配给本计划项的文件与既定文档面；不讨论产品需求，不改生命周期状态，不
执行端到端验收。

## Required reading (in order)

1. `wiki/00-spec.md`
2. `wiki/02-file-authority-map.md`
3. `wiki/03-current-decisions.md`
4. `wiki/code-ai/project-facts.md`
5. `wiki/code-ai/subagent-flow.md`
6. `wiki/code-ai/core-agent.md`
7. `wiki/code-ai/_blocks/coding-discipline.md`
8. `wiki/governance/workflow-profile.md`
9. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/feasibility/confirmed-constraints.md`
10. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/discussion/workbench.md`
11. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/core/implementation.md`
12. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/core/quote-content-contract.md`
13. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/core/testing-and-acceptance.md`
14. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/implementation.md`（接缝与注册骨架的上游权威）
15. 当前获批的 `implementation-plan.md`（在本目录）

## Feature business boundary

目标行为：

- `.html` / `.htm` 预览头部出现接管开关，默认关闭；开关状态存浏览器 `localStorage`
  （键 `dsh-side-quote:html-takeover`，值 `'on'`），缺失或非法一律视为关闭。
- 接管生效条件为「持久开关为开」且「`ctx.configForms.developerTools.enabled` 为真」；
  不满足时不注册任何接管项，HTML 预览仍由自带实现渲染。
- 生效时：`ctx.documentPreviews` 注册 `html`/`htm` 实现（`priority: 'extension'`、
  `loading: 'bytes-complete'`、`wrap: false`），keyed `sidebar.right.tab.document` 注册
  正文，`sidebar.right.tab.document.actions` 注册引用按钮变体；正文用 `blob:` iframe
  （`sandbox="allow-scripts"`）承载，引导脚本预写注入桥。
- 桥单向上报（`selectionchange` / `mouseup` / `keyup`），父侧按 iframe 缓存并严格校验
  报文；`readSelection` 同步读缓存。
- 适配器接缝扩展：`target` 增加 `tab: { sessionId, occurrenceId }`，`Capture` 可选带
  `witness`；核心在 `createQuoteActions` 内按"有/无 witness"两分支判定归属。
- 降级：开启时自检一次并给出一条通知；运行期只置灰 + tooltip；桥 4000ms 未就绪按不可用。

明确非目标（不得顺手实现）：

- 相对资源读取/打包、图片内联、ESM 或 CSS `url()` 处理。
- 修改自带插件包、替换自带 HTML 实现、给 iframe 加 `allow-same-origin`。
- 把 `html`/`htm` 加进 `ALLOWED_SUFFIXES`，或改动文本引用按钮/文本适配器。
- 内容特征级敏感检测、跨预览体选区、全量「会话已读」判定。
- 任何构建链、JSX/TS 源文件、第三方运行时依赖。
- 为桥增加消息令牌或白名单文本校核（已被证据否决）。

行为变更摘要（来自 workbench）：

- 新增：接管开关、接管渲染与引用、桥与降级通知、中英新增文案。
- 保留：接管关闭时 HTML 预览由自带实现渲染且正文像素一致；白名单、文本按钮、文本
  适配器、模板、截断、指针块、敏感名、`summary`、已引用记录全部不变。
- 移除/降级：接管开启时外部 CSS/JS/图片不加载；手动切回自带渲染器时引用按钮恒置灰。
  这两项是新能力的显式边界，**不得**当成缺陷去"修好"。
- 高影响移除逐项确认：不适用（无既有能力被移除）。

已核对的权威文档：`wiki/03-current-decisions.md`、`wiki/code-ai/project-facts.md`、
`wiki/validation/README.md`——无冲突。本 Feature 派生出的唯一契约变更是 F01 的 E-04
对 `.html` 的断言（见 `core/testing-and-acceptance.md` §6），F01 的 U-10 不变。

允许写入：

- `code/client.js`、`code/test/**`（单元与端到端用例）；`code/index.js` 预期不改
- `code/README.md`（仅追加本 Feature 的已知取舍条目）
- `test/e2e/formats.test.mjs`（把 `.html` 断言改为"无引用按钮、有接管开关"）
- `wiki/code-ai/project-facts.md` 的 §5 测试分层（若实现期新增端到端环境变量，同批补 §4）
- 本 Feature 的 `evidence/`（仅当 plan item 明确要求写入实现期证据）

禁止写入：

- `code/package.json` 的 `dependencies`（必须保持为空）与 `files`（不得加入 `test/`）
- `code/cordis.patch.yml`（除非计划明确要求且已获编排者批准）
- `wiki/feature-workspace/**/feature.yaml`（生命周期只由流程技能改）
- `.factory/factory.yaml` 与 `wiki/governance/workflow-profile.md`（本 Feature 不新增命令；
  确需新增时必须先改配置并 `factory upgrade`，且计划里已写明）
- 其他 Feature 目录、其他 owner 的权威文档、用户的 DSH live profile、任何自带插件包
- 仓库内任何名为 `.env` 的文件（夹具必须在运行时生成）

必须先更新的文档：`wiki/code-ai/project-facts.md` §5 与 `code/README.md` 取舍条目，
与代码同批完成；两者未同步视为未完成。

## Tests and acceptance

TDD 顺序与代码质量纪律以 `wiki/code-ai/_blocks/coding-discipline.md` 为准（先红后绿、
最小改动、测行为不测实现、不留死代码），本 profile 不重述。

必须实现的单元测试（用例先行，见 `core/testing-and-acceptance.md` §2 的 U-20…U-31）：

- U-20 白名单不变（`html`/`htm` 不命中，含大小写）
- U-21 接缝两条归属分支（含 `witness` 不等、`focusedTarget` 抛错）
- U-22 `target` 形状（含 `occurrenceId` 缺失时的置灰）
- U-23 报文校验（渠道/版本/kind/类型/长度/来源/origin 不符一律静默丢弃）
- U-24 桥状态按 iframe 隔离与卸载清理
- U-25 就绪超时 4000ms 与恢复
- U-26 闸门状态机（不注册 / 注册一次 / 注销干净 / 幂等）
- U-27 持久化 fail-closed（缺失、非法、读写抛错）
- U-28 开→关→卸 的各项计数归零（含 blob URL 回收）
- U-29 通知预算（自检各分支恰一条、状态通知去重、不叠加点击通知）
- U-30 "只加不减"结构断言
- U-31 中英字典新增键一致，内容文案不在字典

必须同时交付（不得延后）：

- 端到端用例骨架（见 `core/testing-and-acceptance.md` §3 的 E-10…E-18）：普通 `node:test`，
  通过既有环境变量连接外部实例；变量缺失时 `skip` 并写明理由，**不得伪造成通过**。
- `code/README.md` 的九条已知取舍（`core/testing-and-acceptance.md` §8）。
- F01 的 E-04 `.html` 断言改写（`core/testing-and-acceptance.md` §6 第 3 条）。

验收标准：见 `core/testing-and-acceptance.md` §6 的 AC-17…AC-30。实现角色只对自己可
验证的部分（AC-18、AC-22、AC-23、AC-24、AC-26 与单元层覆盖）负责；浏览器层由验证角色
判定。AC-17、AC-19、AC-25、AC-27、AC-28 不得由实现者自判。

视觉/交互影响：**在范围内**。实现必须让下列断言稳定可观察：接管开关与引用按钮的
`data-side-quote-html-toggle` / `data-side-quote-html-quote`、正文容器
`data-side-quote-html`、iframe `data-side-quote-html-frame`；可用性不依赖时序竞争。

验证命令（只引用命令表，不得自行发明）：

- `node --check code/index.js`
- `node --check code/client.js`
- `node --test --test-concurrency=1 "code/test/**/*.test.mjs"`

端到端命令 `node --test --test-concurrency=1 "code/test/e2e/**/*.test.mjs"` 已登记，但实现角色不执行浏览器
验收；由验证角色在独立环境运行。

## Handoff

按 `wiki/code-ai/_blocks/handoff-output.md` 七段输出，并包含评审门摘要。必须写明：

- 改动文件清单与每项对应的 plan item 编号。
- 每条 AC 的自测状态（通过/失败/未执行），未执行项必须写"未执行"，不得写"应该没问题"。
- `project-facts.md` §5 与 `code/README.md` 的同步情况。
- 桥的注入策略、报文校验与 4000ms 超时是否按 `core/implementation.md` §5 实现，以及
  任何偏离及理由（偏离必须回到编排者，不得自行决定）。
- 回滚方式与需要评审重点看的部分。
- 不得声称"已评审通过"。

Agent notes 与 README 同步遵循 `wiki/code-ai/_blocks/agent-notes-rule.md` 与
`wiki/code-ai/_blocks/readme-sync-rule.md`。完成定义见
`wiki/code-ai/_blocks/common-definition-of-done.md`，另加本 Feature 要求：
`code/package.json` 的 `dependencies` 为空、`files` 不含 `test`，且未出现 `allow-same-origin`。

## Plan Gate

- 开始前必须拿到当前获批的 `implementation-plan.md` 与分配给自己的 plan item 编号。
- 只改该 plan item 指定的文件与行为；计划缺失或不一致时停止并交回编排者。
- 发现需要改变契约、验收标准或写入范围时，停止受影响部分并升级，不得在实现中改目标。
- 超出 `code/` 的写入（`project-facts.md`、`code/README.md`、E-04 断言）只在该 plan item
  明确包含时执行。
