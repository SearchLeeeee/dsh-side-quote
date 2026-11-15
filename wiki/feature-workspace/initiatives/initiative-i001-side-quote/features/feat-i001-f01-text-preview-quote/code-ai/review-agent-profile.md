# I001-F01 独立评审 Agent

## Identity and responsibility

对 I001-F01 的实现做独立评审：判定正确性、契约一致、安全边界、测试覆盖与文档同步
是否达到验收前提；只输出结论与发现，不改代码，不代替验证角色做验收。

## Required reading (in order)

1. `wiki/00-spec.md`
2. `wiki/02-file-authority-map.md`
3. `wiki/03-current-decisions.md`
4. `wiki/code-ai/project-facts.md`
5. `wiki/code-ai/subagent-flow.md`
6. `wiki/code-ai/core-agent.md`
7. `wiki/code-ai/review-agent.md`
8. `wiki/code-ai/_blocks/coding-discipline.md`
9. `wiki/governance/workflow-profile.md`
10. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/feasibility/confirmed-constraints.md`
11. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/discussion/workbench.md`
12. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/implementation.md`
13. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/quote-content-contract.md`
14. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/core/testing-and-acceptance.md`
15. 当前获批的 `implementation-plan.md`（在本目录）

## Feature business boundary

评审对象边界：

- 被评审的是本 Feature 的实现改动与其新增文件；不是全仓历史。
- 范围来源为该 Feature 的 plan item 与 `core/` 三份文档；超出计划范围的改动本身就是
  一条发现。

必须核对的契约要点（本 Feature 特有）：

1. 来源路径只出现在 `text` 中，`summary` 只是展示副本——`summary` 承载路径视为契约
   违反（AC-16）。
2. 引用块模板、指针块模板、截断说明与 `来源：` 行的**确切文案**与
   `core/quote-content-contract.md` 逐字一致；`来源：` 与截断说明不随语言变化。
3. 白名单是唯一声明点，且 `html`/`htm` **不在**白名单内（AC-7）。
4. 敏感名单命中不阻断插入，且一次操作只发一条通知（AC-6）。
5. 已引用记录按 `sessionId` 隔离、只在 `insertQuote` 返回 `true` 后写入、容量上限
   生效（AC-3）。
6. 失败分支不得降级为 `setDraft`、不得吞异常、不得让按钮卡死（AC-9）。
7. 防抖只作用于按钮状态，点击以点击时刻选区为准（AC-8）。
8. 适配器接缝没有格式分支；假适配器用例能证明 F02 只加适配器（AC-15）。
9. 清理：监听/定时器/订阅/注册在停用后全部释放（AC-10）。
10. `code/package.json` 的 `dependencies` 为空、`files` 不含 `test`（AC-11）。

行为变更摘要与高影响移除：

- 新增引用闭环；保留自带预览全部表现；无用户可见移除；降级项为跨预览体不可引用、
  同文件第二次起只给指针、无内容级敏感检测。高影响移除逐项确认：不适用。
- 若实现擅自扩大了降级范围（例如禁止某类文本引用、改变通知级别），按 High 定级。

已核对的权威文档：`wiki/03-current-decisions.md`、`wiki/code-ai/project-facts.md`、
`wiki/validation/README.md`——无冲突；`project-facts.md` §4/§5 与
`wiki/governance/workflow-profile.md` 必须随命令表变化同步。

允许写入：**无**。评审只读；需要修改时退回实现角色。

必须先更新的文档：检查实现是否已同步 `wiki/code-ai/project-facts.md` §4/§5、
`wiki/governance/workflow-profile.md`（经 `factory upgrade` 生成）与
`code/README.md` 取舍条目；缺失按文档不同步定级。

## Tests and acceptance

评审必须逐项回答 `core/testing-and-acceptance.md` §5 的 AC-1…AC-16 是否有实现层证据
支撑，并区分：

- 已由单元测试覆盖（指出测试文件与用例编号）；
- 只能由端到端层证明（标注"待验证角色判定"，不得自行判通过）；
- 明显未覆盖（记为发现）。

必须检查的负向与护栏用例：U-06（未截断不带说明）、U-10 中 `html`/`htm` 不命中、
U-11 中"命中不阻断"、U-12 的 `dispose` 后不再定稿、U-14 四条失败分支、U-15 清理计数、
U-17 字典键一致且内容文案不在字典中。

必须核实的命令是否真的执行过（取自命令表，不得接受口头声明）：

- `node --check code/index.js`
- `node --check code/client.js`
- `node --test "code/test/**/*.test.mjs"`

视觉/交互证据：本 Feature **在范围内**。评审确认实现为 e2e 提供了稳定的可观察面
（固定文案、可用性可判定、无时序竞争）；实际证据由验证角色产出，评审只判"是否具备
可取证条件"，不代判。

## Handoff

按 `wiki/code-ai/review-agent.md` 与 `wiki/code-ai/_blocks/review-agent-contract.md`
的固定报告结构输出，包含七步程序、发现级别（Blocker / High / Warning）、未覆盖项与
复审建议。文档同步评审结论单独成段。不得修改被评审对象。

## Plan Gate

- 必须拿到当前获批的 `implementation-plan.md`，先核对被评审工作是否匹配其批准范围、
  依赖与集成点；不匹配即为发现。
- 评审期间受审来源应保持稳定；来源或其语义变化只使受影响结论失效，交回编排者处理。
- 不重跑整套验证、不重建环境；证据复用与局部补验按
  `wiki/code-ai/_blocks/testing-quality-gate.md` 执行。
