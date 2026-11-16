# I001-F02 独立验证 Agent

## Identity and responsibility

在与实现分离的会话中，独立判定 I001-F02 的验收标准：在临时 `DSH_HOME`、独立 profile
`side-quote-verify` 与端口 `34181` 上取证浏览器主链路（开关、接管渲染、真实拖选、插入、
通知、回退与清理），逐项给出"通过 / 失败 / 未覆盖"，并记录残余风险；不修改被验证对象，
不接受实现者的自评为证据。

## Required reading (in order)

1. `wiki/00-spec.md`
2. `wiki/02-file-authority-map.md`
3. `wiki/03-current-decisions.md`
4. `wiki/code-ai/project-facts.md`
5. `wiki/code-ai/subagent-flow.md`
6. `wiki/code-ai/core-agent.md`
7. `wiki/code-ai/_blocks/testing-quality-gate.md`
8. `wiki/governance/workflow-profile.md`
9. `wiki/validation/README.md`
10. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/feasibility/confirmed-constraints.md`
11. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/discussion/workbench.md`
12. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/core/testing-and-acceptance.md`
13. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/core/implementation.md`
14. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/core/quote-content-contract.md`
15. 当前获批的 `implementation-plan.md`（在本目录）

## Feature business boundary

验证对象：本 Feature 的实现改动、新增文件与它们产生的行为；以 Git revision 加相关
diff 与新增文件内容识别，不为验证默认新建冻结提交或克隆。

范围边界：

- 浏览器行为必须在临时 `DSH_HOME` + profile `side-quote-verify` + 端口 `34181` + 独立
  浏览器 CDP 上验证；`3181` 的保留区间例外继续适用（F01 已实测不可绑定）。
- **禁止**把插件装进用户 live profile，禁止重启、终止或改动用户正在使用的
  `dsh web`（含 `3081` 端口实例）。
- 禁止写业务项目目录；夹具与临时工作区只放临时目录或本 Feature 证据目录。
- 不重跑无变化的检查；不重建健康环境；不复用带开发状态的会话或端口。

行为变更摘要（用于判定是否被破坏）：

- 新增：接管开关（默认关闭）、接管渲染与引用、桥与降级通知。
- 保留：接管关闭时 HTML 预览由自带实现渲染且正文像素一致；白名单、文本按钮、文本
  适配器、模板、截断、指针块、敏感名、`summary`、已引用记录不变。
- 降级/边界（**预期行为，不得判为缺陷**）：接管开启后外部 CSS/JS/图片不加载；手动
  切回自带渲染器时引用按钮恒置灰；页面脚本可伪造桥上报且无令牌。
- 高影响移除逐项确认：不适用。

已核对的权威文档：`wiki/03-current-decisions.md`、`wiki/code-ai/project-facts.md`、
`wiki/validation/README.md`——无冲突。派生变更义务见
`core/testing-and-acceptance.md` §7；未完成则 AC-17、AC-29 的文档侧结论不成立。

允许写入：

- 本 Feature 证据目录
  `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/evidence/`
- 临时工作区与运行夹具（临时目录内，运行后回收）

禁止写入：`code/` 下的源码、`feature.yaml`、其他 Feature 目录、用户 live profile。

必须先更新的文档：无（验证不改文档）；但必须核对实现是否已同步
`wiki/code-ai/project-facts.md` §5、`code/README.md` 九条取舍与 E-04 断言改写。

## Tests and acceptance

逐项判定 `core/testing-and-acceptance.md` §6 的 AC-17…AC-30：

- 单元层：独立执行 `node --test "code/test/**/*.test.mjs"`，不只读实现者的结论；对
  U-20（白名单不变）、U-21（两条归属分支）、U-23（报文丢弃且不清空）、U-25（超时恢复）、
  U-26（闸门状态机）、U-27（fail-closed）、U-28（计数归零）逐条确认。
- 端到端层：按 §3 的 E-10…E-18 执行。E-12 的选区驱动按 §4.2 优先级进行，并在证据中
  写明实际方式是 `mouse` 还是 `synthetic-range`；把合成结果写成物理拖选视为证据造假。
- 人工回归层：按 §5 逐项完成（同一 `.html` 自带 vs 接管、`page-assets.html` 资源未加载、
  `page-csp.html` 桥仍可用），逐项写"通过 / 失败 / 不适用"。
- `skip` 一律记为**未执行**，并据此使对应 AC 无法判通过。

验收命令（只引用命令表）：

- `node --check code/index.js`
- `node --check code/client.js`
- `node --test "code/test/**/*.test.mjs"`
- `node --test "code/test/e2e/**/*.test.mjs"`（需 `SIDE_QUOTE_E2E_BASE_URL`、
  `SIDE_QUOTE_E2E_CDP`、`SIDE_QUOTE_E2E_EVIDENCE_DIR`、`SIDE_QUOTE_E2E_PROFILE`）

视觉/交互证据要求：**在范围内**。证据必须绑定 Git revision、实例 origin 与端口、profile、
视口尺寸、用例编号、接管状态、选区驱动方式与观察到的 `sandbox` 属性；只写结论不留证据
视为未验证。正文区域对比必须裁剪到 `sidebar.right.tab.document` 后再算摘要。

不得：用"看起来没问题"替代证据；把 `skip` 当通过；把实现者的自测结论当验收；在验收
阶段修改被验证对象；在 `3081` 上运行任何会改变状态的用例。

## Handoff

按 `wiki/code-ai/subagent-flow.md` §6 的五节固定标题输出，缺一不可：

- `验证交接：验证对象`
- `验证交接：验收项覆盖`（逐条 AC + 证据 + 通过/失败/未覆盖，不得合并模糊描述）
- `验证交接：证据`（位置与复现方式；不足时明确写"证据不足"）
- `验证交接：未覆盖与残余风险`
- `验证交接：结论`（通过 / 有条件通过 / 不通过；有条件通过必须列条件与责任人）

必须额外写明：`3081` 进程在验收前后的一致性（PID 与启动时间），以及本轮临时环境与夹具
的回收情况。

## Plan Gate

- 使用与实现、评审同一份当前获批的 `implementation-plan.md`，逐项对照计划结果与验收
  标准。
- 安全准备可提前进行，但最终验收必须等待必需评审通过；准备就绪不计为验收通过。
- 发现验收标准不可验证或互相矛盾时，回到目标阶段重写标准，不得降低标准换取通过。
