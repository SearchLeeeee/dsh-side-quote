# I001-F02 固定评审门记录

> 评审依据：`wiki/code-ai/review-agent.md`（固定评审门，不替换为任何动态 profile）与本 Feature 的
> `code-ai/review-agent-profile.md`。报告由独立评审 agent 产出，编排者只负责落盘与登记处置，
> 不改写发现级别与结论。
> 本记录只证明代码、测试与文档在离线可核验的部分；**不证明任何浏览器行为**，浏览器结论由
> `evidence/verification-record.md` 的独立验收承担。

## 1. 评审边界与角色

| 项 | 值 |
| --- | --- |
| 工作仓库 | `D:\dsh-side-quote` |
| 实现 owner | `core`（`impl-core` 实现 P1/P3/P4/P5，`impl-e2e` 实现 P2/P6，`impl-fix` 执行评审修复） |
| 评审角色 | 独立评审 agent（与实现分离，只读；未参与任何实现编辑） |
| 计划 | `code-ai/implementation-plan.md` 修订 1（评审轮 1）与修订 2（§8 评审修复项，评审轮 2） |
| 命令来源 | `.factory/factory.yaml`（`factory upgrade` 生成的 `wiki/governance/workflow-profile.md`） |

## 2. 第 1 轮（对象 `27d60ee..391921a`）

- 对象：`391921a feat(code): take over the HTML preview behind an explicit toggle`（父 `27d60ee`）。
- 范围：`git diff 27d60ee..391921a`，10 文件 +4361/−81（`code/client.js`、`code/README.md`、
  6 个测试文件、`wiki/code-ai/project-facts.md`）。
- 来源稳定性：评审开始时 `HEAD == 391921a`、工作树 clean；评审期间无并发写入。
- 独立复跑：`node --check code/index.js` → 0；`node --check code/client.js` → 0；
  `node --test "code/test/**/*.test.mjs"` → tests 69 / pass 52 / fail 0 / skipped 17
  （17 项 e2e 缺驱动，**不计通过**）。
- 结论：**有条件通过**。无 Blocker；1 项 High、5 项 Warning、6 项 Nit。

发现与处置（详见 `code-ai/implementation-plan.md` §8）：

| 编号 | 级别 | 摘要 | 处置 |
| --- | --- | --- | --- |
| H-1 | High | 登记的 `e2e`/`verify` 命令缺少串行约束；`E-08`/`E-10`/`E-16`/`E-18` 会改实例全局状态，并发执行产生假失败 | 已修复：`.factory/factory.yaml` 三条命令加 `--test-concurrency=1` + `factory upgrade` + `project-facts.md` §4 同批（提交 `7a89518`） |
| W-1 | Warning | 门控顺序变化使"父文档选区消失"的点击提示由 `error.ownership` 漂移为 `error.noSelection`，且无用例 | 已修复：补 `U-14 附加（W-1）` 用例 + 实现注释，未回退门控顺序（`f0b8318`） |
| W-2 | Warning | U-28 的 blob 归零断言自证，卸载路径未证明 | 已修复：新增不手动释放的 source，经 `disposeAll()` 断言 `revoked === created`（`f0b8318`） |
| W-3 | Warning | 闸门禁用原因只在 `title`，`disabled` 控件能否弹出无证据 | 已修复：保留 `title`，另加 `aria-describedby` + 内联视觉隐藏说明，单元与 E-16 改 DOM 断言（`f0b8318`） |
| W-4 | Warning | F01 的 E-04/AC-7 与 `implementation.md` §5 未标注被本 Feature 改写 | 登记为已知文档口径差异；不改写 F01 已闭环记录（`AGENTS.md`：不得改写原完成历史），长期 Wiki 合并时以 F02 文档为准 |
| W-5 | Warning | 两个测试文件头声称"红→绿"但无证据 | 已修复：注释改为如实区分先写用例与接线后补写，并声明未保留红→绿输出（`f0b8318`） |
| N-1 | Nit | 载荷转义只处理 `</`，页面含 `<!--<script` 时桥不建立（fail-closed） | 已修复：同一函数补 `<!--` → `<\!--`，bootstrap 用例覆盖（`f0b8318`） |
| N-2 | Nit | `unmounted` 字段恒为 false | 已修复：保留并注明只服务"detach 后定时器仍可能到达"的防御路径（`f0b8318`） |
| N-3 | Nit | `open()` 非闸门失败复用闸门文案 | 已修复：新增 `error.htmlTakeoverFailed`，zh/en 键集合同步（`f0b8318`） |
| N-4 | Nit | `cdp.mjs` 头注释称 `SIDE_QUOTE_E2E_PROFILE` 可选 | 已修复：改为必需（`f0b8318`） |
| N-5 | Nit | 文案"开发者工具"与平台设置项标签"显示代码工作视图"不一致 | 登记为后续措辞项；不把平台标签写进插件文案，README 已并列两种叫法 |
| N-6 | Nit | 去重键实现为"仅页目标"，workbench C-16 与计划写"原因 + 页目标" | 实现更严格且与 `core/implementation.md` §9 一致；合并长期文档时按实现口径统一 |

评审同时确认：五处实现层偏离（`onActivity` 回调、按页目标去重、正文不用 `scrollportRef`/
`addResource`、HTML 按钮组件内自门控、U-15 双位点期望）均可接受；契约一致性、安全面
（`sandbox` 只 `allow-scripts`、父侧四重校验、引导脚本不引用宿主对象、`blob:` 而非 `srcdoc`）、
闸门真值表、接缝等价性与简化门均通过。

## 3. 第 2 轮定向复审（对象 `391921a..f0b8318`）

- 对象：`f0b8318 fix(code): close the I001-F02 review gate findings`（含 `8bd513a` 计划、
  `7a89518` 配置、`f0b8318` 代码修复）。
- 独立复跑：`node --check` ×2 → 0；`node --test --test-concurrency=1 "code/test/**/*.test.mjs"`
  → **tests 71 / pass 54 / fail 0 / skipped 17**；`git diff --check` → 无空白错误；
  `factory upgrade --check` → `up to date`（生成文件与配置一致，无生成漂移）。
- 结论：**通过**。无 Blocker / High。H-1、W-1…W-5、N-1…N-4 全部"已修复"或按计划 §8 登记；
  W-4、N-5、N-6 核为已登记后续项。
- 新增发现：**W-new-1（Warning，文档对齐）** 旧命令副本（`verification-agent-profile.md`、
  `code/README.md` 第 46/56 行、`project-facts.md` §5、`core/implementation.md` §12、
  `core/testing-and-acceptance.md` §1、根 `README.md`、其余 profiles）仍写未串行命令。
  - 处置：已在闭环批同批修正为带 `--test-concurrency=1` 的形式（`init-baseline.md` 与 F01 已闭环
    记录不改；后者属历史证据）。该修正为文档对齐，不改变被测代码，不影响第 2 轮结论。

## 4. 评审门的边界声明

- 本轮评审**不证明浏览器行为**：`E-10`…`E-18` 在评审阶段全部未执行（`skip` 理由为未提供
  浏览器驱动），`AC-17`…`AC-30` 的浏览器侧判定由独立验收 session 取证。
- 评审结论只对 `f0b8318` 及其 `27d60ee..f0b8318` 差集有效；来源再变化时只使受影响结论失效。
- 未执行未受影响面的重跑（契约一致性、安全面、闸门真值表、简化门沿用第 1 轮结论），因为修复
  只触及转义、开关渲染、错误文案键、测试与命令表。
