# I001-F02 Code AI Profiles 索引

> Feature：I001-F02 HTML 预览接管适配（默认关闭、显式开启）
> Feature 根：`wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/`
> 生命周期：`code-ai-profiles / completed`。代码实现必须在新会话中由
> `$hl-feature-orchestrator` 接手。

## 1. 这套 profiles 是什么

把已确认的需求结论与领域实现文档，转成四个角色可直接执行的 agent profile。通用工程
约束不在这里复制，全部通过相对路径引用 `wiki/code-ai/` 下的权威文件；这里只保留本
Feature 特有的业务逻辑、实现边界、测试要求与验收标准。

## 2. Profile 清单与职责

| Profile | 角色 | 职责 | 不得做 |
| --- | --- | --- | --- |
| [reading-agent-profile.md](reading-agent-profile.md) | 阅读 | 建立本次改动的代码事实基线：F01 现有骨架、`documentPreviews`/slots/configForms 可用面、桥与接缝的真实注入点、风险 | 修改业务逻辑、把推测写成事实 |
| [core-implementation-agent-profile.md](core-implementation-agent-profile.md) | 实现（owner `core`） | 在获批计划项范围内实现接管定义/正文/开关/按钮变体、桥、闸门状态机、接缝扩展与单元测试 | 扩大范围、越出 `code/` 与既定文档写入面、改生命周期状态、自行判定契约 |
| [review-agent-profile.md](review-agent-profile.md) | 评审 | 独立评审正确性、契约、安全边界、测试、文档同步 | 改代码、被实现角色说服后放行 |
| [verification-agent-profile.md](verification-agent-profile.md) | 验证 | 在独立 profile 与独立端口上取证浏览器行为并逐项判定验收标准 | 用"看起来没问题"替代证据、自我验收 |

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
9. `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/discussion/workbench.md`
10. 本角色 profile
11. 本 Feature 的领域实现文档（按角色所需，见 §4）
12. 当前获批的 `implementation-plan.md`

## 4. 领域文档与执行顺序

- 领域实现文档：`core/implementation.md`、`core/quote-content-contract.md`、
  `core/testing-and-acceptance.md`（均在 Feature 根的 `core/` 下）。
- 上游基线：`wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f01-text-preview-quote/`
  的 `core/` 三份文档与 `code/README.md`。F01 已 `ready-to-merge / ready`，其实现与
  验收已闭环，是本 Feature 的代码基线；**不得重开 F01 的已确认结论**。
- 执行顺序：`intake → preflight → goal → 代码调研与计划提议 → 整合计划获批 → 实现 →
  评审 → 分离验收 → 闭环`。编排顺序、阶段退出条件与角色独立性以
  `wiki/code-ai/subagent-flow.md` 为唯一来源。

## 5. 实施计划门（Plan Gate）

- 编排者在调研实际代码之后，在本目录创建**唯一**的 `implementation-plan.md`
  （格式见 `wiki/code-ai/implementation-plan-template.md`）。
- 生成 profiles 时**不**创建空的或推测性的计划文件；计划由编排者在代码调研后写入。
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

1. **默认关闭**：未显式开启时不得注册任何接管项；HTML 预览仍由自带实现渲染。
2. **只经官方扩展点**：`ctx.documentPreviews` 定义 + keyed `sidebar.right.tab.document`
   正文 + `sidebar.right.tab.document.actions` 头部位点；自带插件包不改、不替换、不卸载。
3. **不透明 origin**：iframe 只允许 `sandbox="allow-scripts"`，绝不加 `allow-same-origin`；
   桥只单向传文本，不向页面暴露任何宿主对象或会话能力。
4. **零构建、零运行时依赖**：手写已构建 bundle（纯 JS、无 JSX/TS），React 经 `require()`
   解析；`code/package.json` 的 `dependencies` 保持为空，`files` 不含 `test/`。
5. **白名单不动**：`ALLOWED_SUFFIXES` / `ALLOWED_FILENAMES` / `isAllowedPath` 与文本引用
   按钮一字不改，`html` / `htm` 仍不命中。
6. **不读取相对资源**：外部 CSS / JS / 图片一律不加载（已决策）；不得顺手实现打包。
7. **隔离取证**：端到端只在临时 `DSH_HOME` + profile `side-quote-verify` + 端口 `34181`
   + 独立浏览器 CDP 上进行；**不得**使用 live 的 `3081`，不得重启、终止或改动用户正在
   使用的 `dsh web`，实验代码不得进入 live profile。
8. **已知契约变更**：F01 的 E-04 对 `.html` 的断言按本 Feature 的
   `core/testing-and-acceptance.md` §6 改写为"无引用按钮、有接管开关"；F01 的 U-10 不变。
9. **不重开讨论**：本 Feature 的 12 个问题已定案（见 workbench `Question inventory`），
   遇到文档未覆盖的阻塞才回到编排者，不得在实现中改目标、契约或验收标准。
