# I001-F01 固定评审门记录

> 评审门：`wiki/code-ai/review-agent.md`（固定入口，含 13 个通用约束块）及其报告契约
> `wiki/code-ai/_blocks/review-agent-contract.md`。评审由独立评审角色执行，只读、不改实现、
> 不做生命周期转换。本文件是该门三轮评审核对结论的结构化记录；完整叙述留在评审 session，
> 本记录保留结论、发现位置与处置，供验收与后续审计复算。

## 轮次与来源身份

| 轮次 | 受审来源 | 覆盖范围 | 结论 |
| --- | --- | --- | --- |
| 1 | `39fa84d..df693c1` | 实现、单元层、e2e harness、派生文档同步 | 有条件通过（1 High + 10 Warning + 6 Nit） |
| 2 | `df693c1..1d785da` | H-1 修复、W-1…W-9 与 N-1…N-5 回写与清扫 | 有条件通过（0 High；W-3/W-4/W-11 仍需处置） |
| 3 | `1d785da..f5dadaa` | W-4 口径、E-05 层级断言、§4.2 环境变量、N-2/N-6 | **通过**（无 Blocker/High/Warning/Nit） |

评审对象始终以 Git revision 识别，评审期间来源保持稳定；三轮之间未发生未记录的源码替换。

## 第 1 轮（`df693c1`）

### Blocker

无。

### High

| ID | 发现 | 处置 |
| --- | --- | --- |
| H-1 | 归属校验只判定选区锚点侧，未判定终点侧；两窗格各开一个文本预览时，跨窗格选区会让 A 的按钮可用、把 B 的文本按 A 的路径写入 `来源：`，并绕过 B 的敏感名警示（与 `core/implementation.md` §8、C-04 冲突） | 已在 `1342c14` 修复：新增 `readSelectionEndAnchor`（`focusNode` → `range.endContainer`），按钮/起点/终点三方 `occurrence.id` 与 `sessionId` 一致才可用；终点缺失或抛错一律置灰；补 U-19 单测（跨预览体置灰、同属仍可用、终点缺失、终点抛错） |

### Warning 与处置

| ID | 发现 | 处置 |
| --- | --- | --- |
| W-1 | 文档要求 `pointerdown`、实现用 `mousedown` | 已回写 `implementation.md` §8.1 并说明理由（`pointerdown` 的 `preventDefault` 有吞掉 `click` 的风险） |
| W-2 | AC-16 与内容契约 §7 对 `summary` 是否含路径互相矛盾 | 四份文档统一口径：进入消息正文的只有 `text` 的 `来源：` 行，`summary.title` 是展示副本 |
| W-3 | E-05 以 `secret.md` 替代 `.env` 未回写，且未断言通知条数与层级 | 已回写 E-05/§4.2 的环境例外；E-05 断言恰好一条敏感文案 + `role === 'status'` + 零条 error 文案 |
| W-4 | 无会话/无作用域时 `error` 通知无可用通道，单测用注入 `notify` 掩盖 | `stateOf` 要求作用域可用（置灰）；§8 两行、§8.1、U-14、AC-9、`code/README.md` 统一为"置灰 + 竞态静默"；本版不引入会话无关通知位点（新增外部面须另开评审面） |
| W-5 | E-04 只有缺席断言，可能假通过 | E-04 改为同一页先做 `.md` 正向对照，再逐格式断言不出现 |
| W-6 | 过程记录 6 处死链 | 已修正相对深度（workbench 4 处、两份 feasibility 摘要各 1 处），全部目标可解析 |
| W-7 | harness 不拒绝 live 端口、不记录实例身份 | 拒绝 `3081`（除显式 `SIDE_QUOTE_E2E_ALLOW_LIVE=1`）；每次运行打印实例/端口/profile/驱动/证据目录摘要 |
| W-8 | 截图默认不落盘、无 revision/实例/视口 | 证据目录必需；每张截图配 `.json` sidecar（用例号、git revision、脱敏地址、端口、profile、视口、时间戳） |
| W-9 | `project-facts.md` §3 仍称浏览器产物为 ES module | `factory.yaml` 的 `project.stack` 与 §3 改为 classic-script bundle + ESM 宿主半，`factory upgrade` 同批提交 |
| W-10 | `a9369f3` 提交边界合并并夹带兄弟 Feature 记录 | 按 `AGENTS.md` 禁止改写历史，不改写；在交接中如实说明，后续按边界拆分 |

### Nit 与处置

| ID | 发现 | 处置 |
| --- | --- | --- |
| N-1 | `client.js` 902 行超软阈值 | 核实 classic `<script>` 单入口后保持单文件，并在 `implementation.md` §9 与 `code/README.md` 记录不拆的理由 |
| N-2 | 死代码 | 主要项已删；残留 `centerOf` 于第 3 轮清除 |
| N-3 | README 描述遮罩关闭时机错误 | 已改为"页面加载之后、文件导航之前" |
| N-4 | README 的 e2e 示例是 bash 且用不可绑定的 3181 | 已改为 PowerShell 并指向验收环境文档 |
| N-5 | e2e 硬编码文案副本 | 已改为经 `load-client.mjs` 从 `internals` 派生 |
| N-6 | 工作台 C-27 与 U-17 相反 | 已在 C-27 下加"后续口径（非权威历史注记）"，指向内容契约与 U-17；C-21 同步加通知口径注记 |

### 第 1 轮保留结论（源码未变即继续有效）

内容契约（原文块/指针块模板与保真、200 行 / 8000 字符先到先截、路径相对化、白名单含
`html`/`htm` 排除、敏感名单三段式与单一声明点、`summary` 契约）、已引用记录键与容量、
"一次点击最多一条通知"、`focusedTarget` 全量 `try/catch`、7 个 `ctx.effect` 全部释放、
零构建 / 零依赖 / `files` 不含 `test`、`ae5474f` 生成文件与配置同批、AC-12 端口例外的
合法性（`netsh` 复核 3119–3218）。

评审门明确不采信的项：实现者自述的隔离 e2e 运行（无仓库内可复现制品）；浏览器行为、
真实拖选可达性、TDD 红→绿顺序、`factory` 三件套的实际执行。

## 第 2 轮（`1d785da`）

结论：有条件通过，0 High。H-1 关闭（三方归属、终点缺失/抛错置灰、同属仍可用、无锚点兜底，
单测覆盖），W-1/W-2/W-5…W-9、N-1/N-3…N-5 确认修复，W-10 处置合理。

| ID | 状态 | 处置 |
| --- | --- | --- |
| W-3 | 部分修复 → 第 3 轮关闭 | E-05 需断言 `role` |
| W-4 | 部分修复 → 第 3 轮关闭 | §8 两行与 AC-9 仍承诺不可投递的 error |
| W-11（新增） | 第 3 轮关闭 | §4.2 未登记 `EVIDENCE_DIR`/`PROFILE`/`ALLOW_LIVE`；sidecar 的 profile 可为 `unspecified` |
| N-2 | 第 3 轮关闭 | `centerOf` 残留 |
| N-6 | 第 3 轮关闭 | C-27 注记 |
| N-7 | 登记后续项 | `feature.yaml` 的 `next_action` 由下一次生命周期转换重写 |
| N-8 | 登记后续项 | 本版 token 在 query，`redactUrl` 已覆盖；路径携带 token 需重评 |

## 第 3 轮（`f5dadaa`）—— 通过

| ID | 状态 | 核对要点 |
| --- | --- | --- |
| W-3 | 已关闭 | E-05 断言"敏感文案恰好一条 + `role === 'status'` + 零条 error 文案"；平台源码证实 info 通知渲染为 `<div role="status">`、error 走 toast，断言与实现一致 |
| W-4 | 已关闭 | §8 两行、§8.1、U-14、AC-9、`code/README.md`、工作台注记六处口径一致；`for()` 抛错已在 §8.1 点名且明确本版不作为 |
| W-11 | 已关闭 | §4.2 三个变量与 harness 行为一致；AC-12 改由 sidecar 的 profile + 非 `3081` 端口判定 |
| N-2 | 已关闭 | `centerOf` 已删，复扫无零引用 helper |
| N-6 | 已关闭 | C-21/C-27 注记到位，链接可解析 |
| N-7 / N-8 | 登记后续项 | 见交付交接的残余风险 |

评审明确"无需再开评审轮次"：本轮只改文档与 e2e，产品代码与单元层未变，第一、二轮结论
对未变部分继续有效。

## 覆盖边界（三轮一致）

- 浏览器行为（E-01…E-08、AC-1/2/5/6/7/8/12/13）由独立验收（P9）证明，评审门不替代。
- E-09 双窗格用例、`.env` 浏览器用例只能记"不适用"并写明原因（harness 无法稳定开第二窗格；
  Files 页隐藏 `.` 开头的项），分别由 U-19 与 U-10/U-11 承担该规则的证据。
- 错误级通知的可观测性受平台 Toast 的 ARIA 角色限制未确证；绑定断言是 `role === 'status'`。
- 通知"恰好一条"为可见条数；计数证据在单元层（平台通知存储为单槽位）。
- 真实拖选可达性未证：e2e 的选区由 DOM `Range` 合成，E-01 的真实鼠标点击是硬断言。
- 视觉一致性以验收截图为准，无设计契约。
