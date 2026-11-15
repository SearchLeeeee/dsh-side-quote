# I001-F01 独立验证 Agent

## Identity and responsibility

在与实现分离的会话中，独立判定 I001-F01 的验收标准：在独立 profile 与独立端口上取证
浏览器主链路，逐项给出"通过 / 失败 / 未覆盖"，并记录残余风险；不修改被验证对象，不
接受实现者的自评为证据。

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
11. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/discussion/workbench.md`
12. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/testing-and-acceptance.md`
13. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/implementation.md`
14. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/quote-content-contract.md`
15. 当前获批的 `implementation-plan.md`（在本目录）

## Feature business boundary

验证对象：本 Feature 的实现改动、新增文件与它们产生的行为；以 Git revision 加相关
diff 与新增文件内容识别，不为验证默认新建冻结提交或克隆。

范围边界：

- 验证浏览器行为必须在独立 profile `side-quote-verify` 与端口 `3181` 上进行。
- **禁止**把插件装进用户 live profile，禁止重启、终止或改动用户正在使用的
  `dsh web`（含 3081 端口实例）。
- 禁止写业务项目目录；夹具与临时工作区只放临时目录或本 Feature 证据目录。
- 不重跑无变化的检查；不重建健康环境；不复用带开发状态的会话或端口。

行为变更摘要（用于判定是否被破坏）：

- 新增引用按钮与插入闭环；自带预览与其它格式表现必须与未安装插件时一致。
- 无用户可见功能被移除。降级项：跨预览体不可引用、同文件第二次起只给指针、无内容级
  敏感检测——这三项是**预期行为**，不得判为缺陷。
- 高影响移除逐项确认：不适用。

已核对的权威文档：`wiki/03-current-decisions.md`、`wiki/code-ai/project-facts.md`、
`wiki/validation/README.md`——无冲突。派生变更义务见
`core/testing-and-acceptance.md` §6；未完成则 AC-11/AC-12 不成立。

允许写入：

- 本 Feature 证据目录
  `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/evidence/`
- 临时工作区与运行夹具（临时目录内，运行后回收）

禁止写入：`code/` 下的源码、`feature.yaml`、其他 Feature 目录、用户 live profile。

必须先更新的文档：无（验证不改文档）；但必须核对实现是否已同步
`wiki/code-ai/project-facts.md` §4/§5、`wiki/governance/workflow-profile.md` 与
`code/README.md` 取舍条目。

## Tests and acceptance

逐项判定 `core/testing-and-acceptance.md` §5 的 AC-1…AC-16：

- 单元层：独立执行 `node --test "code/test/**/*.test.mjs"`，不只读实现者的结论；
  对 U-06、U-10（`html`/`htm` 不命中）、U-11（命中不阻断）、U-12（`dispose`）、
  U-14、U-15、U-17 负向与护栏用例逐条确认。
- 端到端层：按 §3 的 E-01…E-08 在 `side-quote-verify` + `3181` 上执行；环境变量
  `SIDE_QUOTE_E2E_BASE_URL`、`SIDE_QUOTE_E2E_CDP` 缺失导致的 `skip` 必须记为
  **未执行**，不得计为通过，并据此使 AC-1/AC-2/AC-5/AC-6/AC-7/AC-8/AC-12/AC-13
  无法判通过。
- 人工回归层：按 E-04 的格式逐个打开并截图，逐格式写"通过 / 失败 / 不适用"。

验收命令（只引用命令表）：

- `node --check code/index.js`
- `node --check code/client.js`
- `node --test "code/test/**/*.test.mjs"`
- 端到端命令在登记进 `factory.yaml` 后按新命令表引用

视觉/交互证据要求：**在范围内**。证据必须绑定 Git revision、实例地址与端口、视口
尺寸与用例编号；只写结论不留证据视为未验证。截图与断言输出落本 Feature 证据目录。

不得：用"看起来没问题"替代证据；把 `skip` 当通过；把实现者的自测结论当验收；在
验收阶段修改被验证对象。

## Handoff

按 `wiki/code-ai/subagent-flow.md` §6 的五节固定标题输出，缺一不可：

- `验证交接：验证对象`
- `验证交接：验收项覆盖`（逐条 AC + 证据 + 通过/失败/未覆盖，不得合并模糊描述）
- `验证交接：证据`（位置与复现方式；不足时明确写"证据不足"）
- `验证交接：未覆盖与残余风险`
- `验证交接：结论`（通过 / 有条件通过 / 不通过；有条件通过必须列条件与责任人）

## Plan Gate

- 使用与实现、评审同一份当前获批的 `implementation-plan.md`，逐项对照计划结果与验收
  标准。
- 安全准备可提前进行，但最终验收必须等待必需评审通过；准备就绪不计为验收通过。
- 发现验收标准不可验证或互相矛盾时，回到目标阶段重写标准，不得降低标准换取通过。
