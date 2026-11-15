# I001-F01 Code AI Profiles 索引

> Feature：I001-F01 文本预览划词引用闭环（通用核心 + 文本格式适配）
> Feature 根：`wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/`
> 生命周期：`code-ai-profiles / completed`。代码实现必须在新会话中由
> `$hl-feature-orchestrator` 接手。

## 1. 这套 profiles 是什么

把已确认的需求结论与领域实现文档，转成四个角色可直接执行的 agent profile。通用工程
约束不在这里复制，全部通过相对路径引用 `wiki/code-ai/` 下的权威文件；这里只保留本
Feature 特有的业务逻辑、实现边界、测试要求与验收标准。

## 2. Profile 清单与职责

| Profile | 角色 | 职责 | 不得做 |
| --- | --- | --- | --- |
| [reading-agent-profile.md](reading-agent-profile.md) | 阅读 | 建立本次改动的代码事实基线：现有骨架、可用客户端位点、风险与实现入口 | 修改业务逻辑、把推测写成事实 |
| [core-implementation-agent-profile.md](core-implementation-agent-profile.md) | 实现（owner `core`） | 在获批计划项范围内实现核心、适配器、按钮组件与单元测试 | 扩大范围、越出 `code/`、改生命周期状态、自行判定契约 |
| [review-agent-profile.md](review-agent-profile.md) | 评审 | 独立评审正确性、契约、安全、测试与文档同步 | 改代码、被实现角色说服后放行 |
| [verification-agent-profile.md](verification-agent-profile.md) | 验证 | 在独立 profile 与独立端口上取证并逐项判定验收标准 | 用"看起来没问题"替代证据、自我验收 |

## 3. 必读顺序（固定）

任何角色动手前按此顺序阅读，不得跳读：

1. `wiki/00-spec.md`
2. `wiki/02-file-authority-map.md`
3. `wiki/03-current-decisions.md`
4. `wiki/code-ai/project-facts.md`
5. `wiki/code-ai/subagent-flow.md`
6. `wiki/code-ai/core-agent.md`（owner 边界）
7. `wiki/governance/workflow-profile.md`（命令、门禁、安全边界）
8. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/feasibility/confirmed-constraints.md`
9. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/discussion/workbench.md`
10. 本角色 profile
11. 本 Feature 的领域实现文档（按角色所需）
12. 当前获批的 `implementation-plan.md`

## 4. 执行顺序

`intake → preflight → goal → 代码调研与计划提议 → 整合计划获批 → 实现 → 评审 →
分离验收 → 闭环`

编排顺序、阶段退出条件与角色独立性以 `wiki/code-ai/subagent-flow.md` 为唯一来源。

## 5. 实施计划门（Plan Gate）

- 编排者在调研实际代码之后，在本目录创建**唯一**的
  `implementation-plan.md`（格式见 `wiki/code-ai/implementation-plan-template.md`）。
- 本 Feature 生成 profiles 时**不**创建空的或推测性的计划文件；计划由编排者在代码
  调研后写入。
- 第一个实现文件改动之前，计划必须已获批。
- 实现、评审、验证角色都从 dispatch 读取**同一份当前计划**，只处理被分配的 plan item；
  计划缺失、或与任务/实际代码不一致时停止并交回编排者。

## 6. 交接期望

| 角色 | 交接结构 |
| --- | --- |
| 阅读 | `wiki/code-ai/subagent-flow.md` §3 的五节固定标题 |
| 实现 | `wiki/code-ai/_blocks/handoff-output.md` 七段，含评审门摘要 |
| 评审 | `wiki/code-ai/_blocks/review-agent-contract.md` 的固定报告结构 |
| 验证 | `wiki/code-ai/subagent-flow.md` §6 的五节固定标题 |

交接必须写清：改了什么、证据在哪、未覆盖什么、下一步需要谁确认。未写交接视为未完成。
未完成时只能报 `in-progress`、`blocked` 或 `not verified`。

## 7. 本 Feature 的硬性前提（所有角色共同遵守）

1. 零构建：客户端只能是手写已构建 bundle（纯 JS、无 JSX/TS），React 经 `require()`
   从平台模块表解析。
2. 零运行时依赖：`code/package.json` 的 `dependencies` 保持为空，`files` 不含 `test/`。
3. 不修改、不替换、不卸载任何 DSH 自带插件包；不读取自带 HTML 预览 iframe 内容。
4. 不把实验代码装进用户 live profile，不重启、不终止用户正在使用的 `dsh web`。
5. 端到端取证只在独立 profile `side-quote-verify` 与端口 `3181` 上进行。
6. 现状即结论：本 Feature 只做文本类预览闭环，HTML 与相对资源属于 `I001-F02`。
