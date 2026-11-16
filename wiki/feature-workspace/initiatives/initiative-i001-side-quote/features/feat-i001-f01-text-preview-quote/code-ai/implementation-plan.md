# I001-F01 实施计划

## 计划信息

- Feature：`I001-F01` 文本预览划词引用闭环（通用核心 + 文本格式适配）
- 计划修订：`1`
- 计划深度：`expanded`
- 深度理由：单一 owner（`core`）但跨四处契约面——DSH 客户端位点与归属校验、进入消息正文的
  引用内容契约、敏感内容与路径安全边界、真实浏览器端到端证据；且需同批改动 `.factory`
  命令面与权威工程事实。影响不清楚的部分不得按低风险假设推进。
- 调研基线：工作仓库 `D:\dsh-side-quote`，`main` @ `ahead 1`（`wiki/feature-workspace` 未跟踪）；
  代码基线为安装骨架 `code/{index.js,client.js,package.json,cordis.patch.yml,test/module-shape.test.mjs}`；
  运行基线为本机 DSH `0.2.2-rc.3`（web profile，live 实例 `3081` 只读、不动）。
- 计划批准：主编排者（本 session）在首个实现编辑前确认；不是额外的用户审批。
- 并行：`sequential`；`I001-F02` 依赖本 Feature，无可并行 Leaf，不开 worktree。

## 1. 目标和边界

- 目标：文本类预览头部出现「引用」按钮；同一预览体内有非空白选区时可用；点击后把
  「摘录 + 空行 + `来源：<工作区相对路径>`」插入当前屏幕会话输入框；同一会话同一文件第二次
  起插入指针块；失败发 `error`、敏感文件名命中发 `info`；成功后静默。
- 权威需求/领域文档：
  - `core/implementation.md`（§3 位点、§3.1 归属校验已回写结论、§4 流程、§5 适配器接缝、
    §6 生命周期、§7 记录、§8 失败边界）
  - `core/quote-content-contract.md`（§1 原文块、§2 指针块、§3 白名单、§4 截断、§5 路径、
    §6 敏感、§7 `summary`、§8 记录）
  - `core/testing-and-acceptance.md`（§2 U-01…U-18、§3 E-01…E-08、§5 AC-1…AC-16、§6 派生义务）
  - `feasibility/confirmed-constraints.md`（第 1–8 条，尤其第 7 条隔离取证）
- 明确不做：HTML 接管与开关、相对资源读取（`I001-F02`）；全量"已读"推断；内容特征级敏感
  检测；跨预览体选区引用；任何构建链 / JSX / TS / 运行时依赖；修改 DSH 自带插件包或输入框组件。
- 行为影响：
  - 新增：引用按钮、插入闭环、指针降级、敏感 `info`、中英字典、端到端命令登记。
  - 保留：自带预览全部既有表现（pdf/png/xlsx/docx/html 零影响）；输入框编辑器自身行为。
  - 移除/降级：无用户可见移除。降级项 = 跨预览体不可引用、同文件第二次起只给指针、
    无内容级敏感检测，均为已确认预期行为。

跨会话接手的不可变约束（正式出处）：`feasibility/confirmed-constraints.md` 第 7 条
（端到端只在独立 profile `side-quote-verify` + 端口 `3181`，实验代码不进 live profile；不重启/
不终止 `3081`）；`wiki/00-spec.md`（过程区隔离）；`code/package.json` 零依赖与 `files` 不含 `test`。

## 2. 调研结论和未决项

已核对的代码与事实（路径 → 对实现的影响）：

- `code/client.js` → `window.__ModuleLoader__.load({ id, factory(require) })`，当前 `inject: []`、
  `apply(){}`；客户端 bundle 由同源 **classic script** 载入（`dsh-client-modules/src/client/manifest.ts`
  的 `loadBundle` 默认实现），因此**不能**用 ESM `import`/`export`、不能相对导入本地文件。
  → 全部运行时代码必须内联在 `code/client.js`；纯逻辑通过 `factory()` 返回的
  `internals` 面暴露给 `node:test`（零构建下唯一可测途径，写入 README 说明）。
- `code/package.json` → `dsh.client.inject` 是"包行到达顺序"，需保留
  `…sidebar-documentpreview`、`…conversation`；Cordis 服务依赖写在 bundle 的 `inject`
  数组：`['slots','sidebarRight','sessions','conversation','locale','timer']`。
- `code/test/module-shape.test.mjs` → 现断言 factory 一旦 `require` 就抛错，实现引入
  `require('react')` 后必须同步改为提供假模块表。
- `sidebar.right.tab.document.actions`（`dsh-client-ui-sidebar-documentpreview/src/client/document/contract.ts`）
  → owner props 恰好 `{ absolutePath }`；`scope: session` 的标准 props 另带 `sessionId`；
  **无** tabId/paneId/hookContext。→ 归属必须经 `ctx.sidebarRight.focusedTarget(element)` 解析。
- `dsh-client-ui-sidebar-right/src/client/{focus.ts,service.ts,tab-domain.ts}` →
  `focusedTarget(element?)` 按元素祖先解析 `{ sessionId, paneId, host, tabId, occurrence }`；
  `occurrence.id` 是打开生命周期身份，`occurrence.navigation.getSnapshot()` 为
  `{ address, params, revision }`；`occurrence()` 可能抛错。→ 身份比较 + `try/catch`。
- `dsh-client-ui-conversation/src/client/input/{hub.ts,facade.ts}` →
  `conversation.input.for(scope)` 在会话未保留时**抛错**；`insertQuote` 返回 `false` 的四类前置；
  成功时平台内部 `focus({preventScroll:true})`；`notify` 不抛错且不要求已挂载。
- `dsh-api-session-controller` 的 `projections.faceOf('workingDirectory').getSnapshot()`
  → 实际类型 `string | null | undefined`，为空必须按失败路径处理（保留原样路径）。
- `ctx.timer.debounce(fn, ms)` → 返回带 `dispose()` 的防抖函数，随 fiber 释放。
- `.factory/factory.yaml` `commands` 尚无 `e2e`；`wiki/code-ai/project-facts.md` §4/§5 仍是旧内容；
  `code/README.md` 仍是工厂占位。三者属本 Feature 派生义务（`core/testing-and-acceptance.md` §6）。

相关权威/契约来源及冲突检查：`wiki/00-spec.md`、`02-file-authority-map.md`、
`03-current-decisions.md`、`governance/workflow-profile.md`、`wiki/code-ai/project-facts.md`
已核对，无语义冲突。发现两处文档内部不一致，已在本计划批准前的文档修订中处理：
① `core/implementation.md` §3.1 正文编号两条却写"三条路径"（第三条实为"减少能力"兜底）；
② `ctx.sessions` 的 `workingDirectory` 类型在文档中写作可能为空的普通值，实际为
`string | null | undefined`。两处均已回写，不构成阻塞。

假设及验证方式：无未验证的推测性假设进入实现。运行期事实（`occurrence` 是否总在、
非焦点 `focusedTarget(element)` 是否稳定、点击时选区是否仍在）一律标为**待 e2e 证实**，
由本计划 P5 的独立验收判定，不得以静态阅读代替。

阻塞决策：无。已确认的两项裁决：
1. 归属校验采用"两元素 + `occurrence.id` 身份比较"（文档已回写），地址读取途径确认存在但
   不单独作为判据（两窗格同开同一文件时地址相等无法区分）。
2. 「插入后不抢焦点」的可实现范围 = 插件自身不移动焦点/不滚动/不清选区；`insertQuote`
   成功路径内部由平台 `focus()`，无法阻止 → 记为已知取舍写入 `code/README.md` 并在最终
   交接中列为残余风险（不改 AC，不改 C-05 的产品意图）。

运行准备（复用既有入口，不重建环境）：

- 端到端实例：独立 profile `side-quote-verify`（已由 `dsh --profile side-quote-verify
  --from-default-profile web --dump-config` 生成，含 `dsh-base` + `dsh-web-app` 两个 bundle），
  端口 `3181`，`--no-open`。live `3081` 全程只读。
- 浏览器驱动：本机 Edge（Chromium）以 `--remote-debugging-port` 启动独立 user-data-dir，
  提供 CDP 端点；测试侧只依赖 Node 24 内建 `fetch`/`WebSocket`，不新增依赖。
- 夹具：临时工作区内生成 `notes/a.md`、`notes/b.md`、各格式样本与运行时生成的 `.env`
  （仓库内不得出现名为 `.env` 的文件）。
- 清理责任：本编排者（验收结束后回收 `side-quote-verify` 的插件安装与临时目录，保留证据）。

## 3. 执行顺序

| Item | Owner | 预期改动文件/范围 | 前置依赖 | 预期结果与验收 | 本步验证 |
| --- | --- | --- | --- | --- | --- |
| P1 | `core` | `code/test/quote-content.test.mjs`（新，先红） | 无 | U-01…U-11、U-17、U-18 用例存在且失败 | `node --test "code/test/**/*.test.mjs"` |
| P2 | `core` | `code/client.js`（内容层：常量、模板、截断、路径、白名单、敏感、`summary`、`internals` 暴露） | P1 | U-01…U-11、U-17、U-18 转绿；`node --check` 通过 | 同上 + `node --check code/client.js` |
| P3 | `core` | `code/test/quote-state.test.mjs`（新，先红） | P2 | U-12…U-16 用例存在且失败 | `node --test` |
| P4 | `core` | `code/client.js`（接缝与状态：适配器注册表、去重、防抖、已引用记录、清理、`createQuoteActions`） | P3 | U-12…U-16 转绿 | 同上 |
| P5 | `core` | `code/client.js`（React 接线：slot 注册、按钮组件、`ctx.effect` 生命周期、locale、失败分支）、`code/package.json`（bundle `inject`、零依赖复核）、`code/test/module-shape.test.mjs`（同步假模块表） | P4 | 按钮可注册、失败分支只有单条通知、清理无残留；U-14 覆盖 | `node --test` + `node --check` |
| P6 | `core` | `code/test/e2e/cdp.mjs`、`code/test/e2e/quote-flow.test.mjs`、`code/test/e2e/formats.test.mjs`（新；`skip` 必须写明"未提供 DSH 实例/浏览器驱动"） | P5 | E-01…E-08 有可执行用例；缺 env 时 `skip` 且原因明确 | `node --test "code/test/e2e/**/*.test.mjs"`（skip 记未执行） |
| P7 | `core` | `.factory/factory.yaml`（仅 `commands.e2e`）、`.factory` 生成物 `wiki/governance/workflow-profile.md`、`wiki/code-ai/project-facts.md` §4/§5、`code/README.md`（7 条取舍 + 3 条实现取舍） | P6 | 命令表含 e2e；生成文件与配置同批；README 取舍齐全 | `factory upgrade` + `factory gate workspace` |
| P8 | 编排者 | 评审门 `wiki/code-ai/review-agent.md` | P1–P7 | 无 Blocker/High 或已修复并复审 | 评审报告 |
| P9 | 验证（独立 session） | 证据目录 `features/feat-i001-f01-text-preview-quote/evidence/` | P8 通过 | AC-1…AC-16 逐项判定；E-01…E-08 + 逐格式回归 | 实测命令 + 截图 |
| P10 | 编排者 | `feature.yaml` 生命周期转换 | P9 | `acceptance/completed` → `ready-to-merge/ready`，`factory gate workspace` 通过 | 状态机 + gate |

- 每个 item 的范围足够小、可单独检查；计划外文件不得顺手修改。
- 未满足依赖的 item 不启动。
- 无并行：单一 owner，P1→P7 顺序执行；P8/P9 角色分离且不重叠写入。

## 4. 条件风险与证据

| 影响面 | 适用？ | 影响、证据或不适用理由 |
| --- | --- | --- |
| API、共享契约、schema/state | 是 | 依赖 6 个 DSH 客户端服务与 2 个 slot 位点；契约出处见 §2。升级回归责任记入 `code/README.md` |
| 持久化、迁移、兼容性 | 是（轻） | 已引用记录只在插件内存、容量 500、停用清空、不持久化；无迁移 |
| 安全、权限或敏感数据 | 是 | 路径（`local-machine-paths`）与文件内容（`credentials`）进入会话正文。规则以 `core/quote-content-contract.md` §5–§6 为唯一权威；证据中不得出现真实机密值，夹具用占位值 |
| 视觉/交互 | 是 | 按钮可用/置灰、插入结果、通知层级；证据须绑定 Git revision、实例地址+端口、视口尺寸、用例编号 |
| 跨 owner、模块或系统边界 | 否 | owner 表只有 `core`；外部面只读（`sidebarRight`/`sessions`/`conversation`/`locale`/`timer`/`slots`） |

前序证据复用：本轮**无**浏览器行为证据可复用（`discussion/workbench.md` 明确"本轮未产生任何
浏览器行为证据"）。单元层结论只能由 P1–P5 的新执行产生；AC-1/2/5/6/7/8/12/13 只能由 P9 的
独立实例执行产生，不接受静态阅读或实现者自评。

## 5. 集成与检查点

| Checkpoint | 触发时机 | 需要的证据 | 通过后继续做什么 |
| --- | --- | --- | --- |
| C1 归属校验落地 | P5 完成、`apply` 可建按钮 | 按钮在位点渲染、`occurrence.id` 可读、`try/catch` 覆盖；单元层通过 | 进入 P6 |
| C2 自动化可执行 | P6 完成 | `node --test "code/test/e2e/**/*.test.mjs"` 在已起实例上不再 `skip` | 交评审门（P8） |
| C3 评审通过 | P8 | 无 Blocker/High；High 已修复或登记接受 | 启 P9 独立验收 |
| C4 验收通过 | P9 | AC-1…AC-16 逐项可判定；E-04 逐格式留档 | P10 生命周期转换 |
| C5 闭环 | P10 | `acceptance/completed` 与 `ready-to-merge/ready` 均记录且 gate 通过 | 最终交接 |

单模型单 agent 的有界 item 不额外制造逐步 handoff；只在 C1–C5 检查点核对。

## 6. 停止与重规划条件

- 目标、验收、用户可见行为或允许文件范围需要扩大。
- 发现未被确认的 API、schema/state、数据迁移、权限/安全或共享契约变化。
- `focusedTarget(element)` 的非焦点用法在真实实例上不成立，导致 §3.1 第 3 步只能降级
  ——此时停止 P5，按下述"减少能力"分支更新本计划并记录 README 取舍，不猜归属。
- 点击时选区已被浏览器折叠且 `preventDefault` 不能保留，导致"以点击时刻选区为准"不可达
  ——停止 P5，只补受影响部分并回到用户裁决口径，不得改用防抖缓存冒充点击时刻。
- 端到端实例无法在不动 `3081` 的前提下建立 → 停止 P9 的浏览器部分，把 AC-1/2/5/6/7/8/12/13
  记 `not verified` 并如实上报，不以单元层结论替代。
- 证据来源缺失、重建或切换时，记录原因、旧新来源与受影响项；受影响项按本计划修订重评。

## 7. 回滚和遗留风险

- 回滚方式：本次改动全部落在 `code/` 与三处派生文档；`git revert` 对应提交即可回到安装骨架。
  `side-quote-verify` 的插件安装用 `dsh plugin --profile side-quote-verify remove dsh-side-quote`
  回收；`3081` 与 live profile 全程无写入，无需回滚。
- 已知残余风险及负责人（`core`）：
  1. 平台 `insertQuote` 成功后自带 `focus()`，"不抢焦点"只到"插件不主动移动焦点"。
  2. `focusedTarget(element)` 的非焦点用法属"实现能力 > 文档承诺"，DSH 升级可能收紧。
  3. 手写 bundle 与 `0.2.2-rc.3` 客户端接口强耦合，升级后必须重跑单元层与端到端层。
  4. 截断阈值固定 200 行 / 8000 字符，不可配置。

## 8. 评审修复项（修订 2）

评审门（`wiki/code-ai/review-agent.md`，对象 `39fa84d..df693c1`）结论为**有条件通过**，
条件与处置如下。未受影响的部分（内容模板、截断、路径、白名单、敏感名单、记录、清理、
零依赖）保留原结论，不重复评审。

| 条件/发现 | 处置 | 责任人 |
| --- | --- | --- |
| H-1 归属校验只判锚点、未判终点，跨预览体选区会以错误来源插入并绕过敏感警示 | `resolveTargets` 增加终点侧（`focusNode`/`range.endContainer`）判定；新增 U-19（锚点 A、终点 B 置灰 + 同属 A 仍可用的护栏）；E-09 双窗格用例（环境不支持则记不适用） | `core` + 编排者 |
| W-1 文档要求 `pointerdown`、实现用 `mousedown` | 回写 `core/implementation.md` §8.1：采用 `mousedown` 及理由（`pointerdown` 的 `preventDefault` 可能吞掉 `click`），并由 E-01 证明点击到达处理器 | 编排者 |
| W-2 AC-16 与内容契约 §7 对 `summary` 是否含路径矛盾 | 澄清口径：进入消息正文的路径只有 `text`，`summary.title` 是展示副本；同步 AC-16、内容契约 §7 与 review profile | 编排者 |
| W-3 E-05 用 `secret.md` 替代 `.env` 未回写、且未断言通知条数 | 回写 E-05 与 §4.2 的环境例外（Files 页隐藏 `.` 开头的项）；浏览器用例断言恰好一条 `info`、无 `error`；`.env` 浏览器用例记不适用，由 U-10/U-11 覆盖；另加 `server.pem` 反例 | `core` + 编排者 |
| W-4 无会话/无作用域时 `error` 通知无可用通道 | 按钮状态计算要求会话作用域可用（正常表现为置灰）；`core/implementation.md` §8/§8.1 与 `code/README.md` 记录该边界；单测补置灰断言 | `core` + 编排者 |
| W-5 E-04 缺少正向对照，可能假通过 | E-04 断言前先在同一页证明白名单 `.md` 出现按钮 | `core` |
| W-6 过程记录 6 处死链 | 修正相对深度（`workbench.md` 4 处、两份 `feasibility/summary.md` 各 1 处） | 编排者 |
| W-7 e2e 不拒绝 live 端口/不校验实例 | harness 拒绝 `3081`（除非显式 override），运行摘要记录实例端口与 profile | `core` |
| W-8 截图证据默认不落盘、无 revision/实例/视口 | 证据目录改为必需；每张截图写 `.json` 伴生（git revision、baseURL+端口、视口、用例号） | `core` |
| W-9 `project-facts.md` §3 仍称浏览器产物为 ES module | 改 `factory.yaml` 的 `project.stack` 与 §3 措辞，`factory upgrade` 同批提交 | 编排者 |
| W-10 `a9369f3` 提交边界合并、夹带 F02 记录 | 不改写历史（`AGENTS.md` 禁止）；在交接中如实说明，后续按边界拆分 | 编排者 |
| N-1 `client.js` 902 行超软阈值 | 核实 classic `<script>` 单入口后保持单文件，理由写入 `implementation.md` §9 与 `code/README.md` | 编排者 + `core` |
| N-2 死代码 | 删除未被调用的 `actions.refresh`/`isDisposed`/`debouncer.isDisposed`/`basenameOf` 与未用 e2e helper | `core` |
| N-3/N-4 README 措辞与示例 | 修正遮罩关闭时机、改为 PowerShell 示例并指向验收环境文档 | `core` |
| N-5 e2e 硬编码文案副本 | 经 `load-client.mjs` 从 `internals` 读取固定常量 | `core` |

## 计划修订记录

| 修订 | 日期 | 改动原因 | 受影响 items | 批准 |
| --- | --- | --- | --- | --- |
| 1 | 2026-11-15 | 初版：基于代码调研与 `0.2.2-rc.3` 位点取证建立 | 全部 | 主编排者 |
| 2 | 2026-11-16 | 评审门有条件通过：新增 H-1 终点侧归属判定与 U-19/E-09，回写 W-1…W-9 的文档口径，登记 N-1…N-5 处置 | P5、P6、P8、P9 + 文档 | 主编排者 |
