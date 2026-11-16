# I001-F01 独立验证记录

> 验证角色：独立验收 session（与实现、评审分离）。本记录只判定，不修改被验证对象。
> 结论：**通过**。逐条状态见第 4 节；未覆盖项与残余风险见第 6 节。

## 1. 验证对象与来源身份

| 项 | 值 |
| --- | --- |
| 工作仓库 | `D:\dsh-side-quote` |
| 分支 / 验收 target | `main` / `f5dadaa4d76ade322d55953cf038400d995fde84`（`f5dadaa`） |
| HEAD 校验 | `git rev-parse HEAD` = `f5dadaa4d76ade322d55953cf038400d995fde84`，未发生移动（无 delta） |
| 工作区未提交内容 | 仅 `feature.yaml`（生命周期记录）与 `evidence/`（本目录），均不属被验证实现 |
| 评审门 | `evidence/review-gate-record.md`：第 3 轮（`1d785da..f5dadaa`）通过，无 Blocker/High/Warning/Nit；明确不证明浏览器行为，由本次验收补证 |
| 验证范围 | 单元层独立执行；端到端层 E-01…E-09 + `.env` 浏览器用例尝试；AC-13 人工逐格式回归 |

验证依据：`core/testing-and-acceptance.md`（§2 U-01…U-19、§3 E-01…E-09、§5 AC-1…AC-16、§4 环境与证据形式）、`core/quote-content-contract.md`、`core/implementation.md`、`code-ai/implementation-plan.md`（修订 3）。

## 2. 环境

| 项 | 值 |
| --- | --- |
| DSH_HOME | `%TEMP%\side-quote-e2e\dsh-home`（临时，验收后删除；未使用用户真实 `%USERPROFILE%\.dsh`） |
| profile | `side-quote-verify`（由自带 web 模板新建，`dsh --profile side-quote-verify --from-default-profile web --dump-config`） |
| 插件安装 | `dsh plugin --profile side-quote-verify add D:\dsh-side-quote\code`（只装入该临时 profile） |
| 实例端口 | `34181`（契约默认 `3181` 落在 Windows 保留段 `3119–3218`，`netsh interface ipv4 show excludedportrange protocol=tcp` 复核，无法绑定；按 §4.1 记录替换为 `34181`） |
| 实例进程 | PID `66464`，启动 `2026-11-16 12:47:31`，命令行 `node ...dsh\lib\bin.js --profile side-quote-verify --no-open --port 34181` |
| 浏览器 | Headless Edge `Edg/157.0.4341.60`，`--remote-debugging-port=39222`，独立 `--user-data-dir` |
| 视口 | `1440x900`（`deviceScaleFactor: 1`） |
| Node / OS | Node `v24.22.2`；Windows `10.0.26200` |
| 工作区夹具 | DSH 默认工作区 `C:\Users\search\Documents\deepseek-harness\default-workspace`（运行前为空）：`notes/a.md`、`notes/b.md`、`notes/secret.md`、`notes/server.pem`、`.env`（合成占位）、`samples/report.pdf|image.png|table.xlsx|doc.docx|page.html`；全部合成、无真实机密，验收后已删除 |
| live 基线 | `3081` 监听 PID `67988`（node，启动 `2026-11-15 22:04:50`），验收前后一致，未重启、未终止 |

## 3. 执行命令与结果

所有命令在 `D:\dsh-side-quote` 下由本验收 session 独立执行。

| 命令 | 结果 |
| --- | --- |
| `node --check code/index.js` | exit `0` |
| `node --check code/client.js` | exit `0` |
| `node --test "code/test/**/*.test.mjs"` | exit `0`：tests 40 / pass 32 / fail 0 / skipped 8（8 个 e2e 文件因该次调用未传外部实例变量而 skip；**skip 不计通过**，e2e 另起运行） |
| `node --test "code/test/e2e/**/*.test.mjs"`（四个变量见下） | exit `0`：tests 8 / pass 8 / fail 0 / skipped 0，`duration_ms 55771` |

端到端运行变量（实际值）：

- `SIDE_QUOTE_E2E_BASE_URL = http://127.0.0.1:34181/?token=…`（boot token，未写入任何证据文件）
- `SIDE_QUOTE_E2E_CDP = http://127.0.0.1:39222`
- `SIDE_QUOTE_E2E_EVIDENCE_DIR = …/evidence/e2e`
- `SIDE_QUOTE_E2E_PROFILE = side-quote-verify`

实测运行摘要（harness 自打印）：`instance=http://127.0.0.1:34181/ port=34181 profile=side-quote-verify driver=http://127.0.0.1:39222`。

环境例外复核：首次运行因夹具不在该实例的默认工作区而失败（Files 树无 `notes`），把夹具放入 `default-workspace` 后复跑全部通过；该失败事实保留在此，不计为产品失败。

## 4. 验收项覆盖（AC-1…AC-16，逐条）

| ID | 状态 | 证据与判定 |
| --- | --- | --- |
| AC-1 | 通过 | U-01、U-02（逐字模板与保真）；E-01 真实鼠标点击（`activate` 返回 `mouse`）后 composer delta 含摘录与 `notes/a.md`，`E-01-1-button-enabled.png`、`E-01-2-inserted.png` 及 sidecar。**口径说明**：浏览器层只能断言 composer 的 `summary` 展示渲染；逐字 `text` 模板由 U-01/U-02/U-07 证明，harness 刻意不发送消息，故“进入模型正文”的逐字链不在浏览器层。 |
| AC-2 | 通过 | U-07 指针模板、U-08 记录；E-02 第二次插入为指针块、含 `notes/a.md`、不含第二段原文，`E-02-1-pointer.png`。 |
| AC-3 | 通过 | U-08 会话隔离/容量/首插幂等；E-03 `b.md` 仍为原文块、未降级指针，`E-03-1-other-file.png`。 |
| AC-4 | 通过 | U-09 工作区外原样、大小写前缀、反斜杠归一；E-01 断言 composer 无盘符绝对路径且含 `notes/a.md`。 |
| AC-5 | 通过 | U-03 行截断、U-04 字符截断、U-05 先到先截、U-06（未截断时 `quote.text` 不含截断说明且逐字等于 `摘录\n\n来源：…`）。 |
| AC-6 | 通过 | U-11（命中只置警示、不影响可引用）；E-05 `notes/secret.md` 原样插入、敏感文案恰好一条且 `role === 'status'`、无 error 文案，`E-05-1-sensitive.png`。 |
| AC-7 | 通过 | U-10 显式断言 `html`/`htm` 不命中且白名单常量不含二者；E-04 同页先证明 `.md` 出现按钮，再对 pdf/png/xlsx/docx/html/pem 逐一无按钮，`E-04-0-positive-control.png`、`E-04-*.png`。 |
| AC-8 | 通过 | U-12 防抖与 dispose、U-13 点击去重、U-19（H-1 两侧归属：跨预览体置灰且不插入、同属仍可用）；E-06 无选区置灰，`E-06-1-no-selection.png`；E-07 切 tab 后旧选区不可用，`E-07-1-after-tab-switch.png`；E-09 双窗格跨预览体会话中两个窗格的按钮均置灰，同窗格选区仅本窗格按钮可用。 |
| AC-9 | 通过 | U-14 六个失败分支：无屏幕会话、无作用域、空白选区、插入被拒、归属失效、`focusedTarget` 抛错，actions 层各一条 error 且不插入；无会话/无作用域在接线下表现为置灰（§8.1），`readSelection` 抛错不外泄（附加用例）。 |
| AC-10 | 通过 | U-15 装→卸后监听（3→0）、定时器、适配器、locale 字典、位点注册、订阅计数全部归零且不再定稿；E-08 停用后按钮消失、再划词无反应、`page.consoleErrors` 为空，`E-08-1-disabled.png`。 |
| AC-11 | 通过 | `code/package.json`：`dependencies` 不存在（零依赖）、`files = [index.js, client.js, cordis.patch.yml]`（不含 test）、`exports` 单一入口；两条 `node --check` exit 0。派生义务核实：`factory.yaml` 已登记 e2e 命令且与重新生成的 `wiki/governance/workflow-profile.md` 同批（commit `ae5474f`）；`project-facts.md` §4/§5 已更新；`code/README.md` 含已知取舍与实现取舍。 |
| AC-12 | 通过 | 30 份 sidecar 全部 `profile=side-quote-verify`、`port=34181`、`gitRevision=f5dadaa…`、`viewport=1440x900`，无 `token=` 泄漏；`3081` 监听 PID `67988` 验收前后一致且启动时间未变（`2026-11-15 22:04:50`）；受测实例的 profile/session 存储均在本轮临时 `DSH_HOME` 下，未触碰 live profile。 |
| AC-13 | 通过 | 人工逐格式回归（第 5 节）：五种非白名单格式 enabled/disabled 截图**逐字节相同**、无引用按钮、两阶段控制台均无 error；`.md` 正向对照出现按钮。 |
| AC-14 | 通过 | U-17：`zh` 与 `en` 键集合完全一致；`来源：`、`已引用过：`、`原文未重复贴出`、`摘录已截断` 均不出现在字典值中。 |
| AC-15 | 通过 | U-16：重复 `id` 注册抛错、注销后不再调用、假适配器（`.fake`）无需修改核心即产出正确原文块。 |
| AC-16 | 通过 | U-18：原文块 `label/title/detail/body` 与指针块 `detail/body` 符合契约，且 `summary` 各字段都能在 `text` 中找到对应内容（仅展示副本）；E-01 composer 展示 `a.md` 与摘录。进入消息正文的来源路径仍只有 `text` 的 `来源：` 行。 |

### 4.1 端到端用例执行判定（E-01…E-09 与 `.env`）

| 用例 | 状态 | 判定要点 |
| --- | --- | --- |
| E-01 | 通过 | 真实鼠标点击路径 `mouse`（非 DOM 兜底）；delta 含 `quick brown fox` 与 `notes/a.md`。 |
| E-02 | 通过 | 第二次为指针块，含 `notes/a.md`，不含 `second bullet item`。 |
| E-03 | 通过 | `notes/b.md` 原文块，未受 a.md 记录影响。 |
| E-04 | 通过 | 同页正向对照 `.md` 按钮出现在前；`.pdf/.png/.xlsx/.docx/.html/.pem` 逐一无按钮。 |
| E-05 | 通过 | `secret.md` 原样插入；敏感提示恰好一条、`role === 'status'`；error 文案 0 条。 |
| E-06 | 通过 | 无选区时按钮存在但 `disabled`。 |
| E-07 | 通过 | 切 tab 再切回后旧选区不保持可用；若按钮仍可用则断言点击不插入（实测走 disabled 分支）。 |
| E-08 | 通过 | 停用后按钮消失、后续划词无效、控制台无 error。 |
| E-09 | 通过（本环境实际执行） | 用可见「分栏」打开第二窗格，A 窗格 `a.md`、B 窗格 `b.md`；构造一条真实 DOM Range（`collapsed=false`、`rangeCount=1`、176 字符），锚点矩形 x=1128（B 窗格）、焦点矩形 x=805（A 窗格）。跨窗格选区后两个窗格按钮均 `disabled`；改选 A 窗格内 `quick brown fox` 后仅 A 窗格按钮恢复可用（护栏）。`E-09-1-cross-pane-greyed.png`、`E-09-2-same-pane-enabled.png`、`E-09-summary.json`。**说明**：选区以 DOM Range 合成（与 E-01…E-07 同一取选仪器），非物理拖选；真实拖选可达性不在本证据范围。 |
| `.env` 浏览器用例 | 不适用 | Files 页不列出以 `.` 开头的隐藏项（`env-case-files-page.png` 实测仅见 `notes/`、`samples/`），浏览器层无法打开 `.env`；该规则由 U-10（`.env` 精确名命中白名单）与 U-11（敏感命中不阻断）承担，**不计为通过**。 |

### 4.2 单元层负向/护栏用例独立确认（读用例断言，非只看计数）

- U-06：断言 `quote.text` 不含 `TRUNCATION_NOTE`，且逐字等于 `10 行 + \n\n来源：notes/a.md`。
- U-10：命中含 `.env`、`b.MD`；不命中含 `x.html`、`x.htm`、`Makefile`、空串；另断言 `ALLOWED_SUFFIXES` 不含 `html`/`htm`、`ALLOWED_FILENAMES === ['.env']`、`page.HTM` 大小写排除。
- U-11：敏感命中集合 16 个示例均 true；`notes.md`/`env.md`/`keyboard.ts` false；且明确断言 `.env` 仍然 `isAllowedPath === true`（命中不阻断）。
- U-12：5 次 <350ms 变更只定稿 1 次；窗口后变更各自定稿；`dispose()` 后 pending 归零、不再定稿、不再起定时器。
- U-14：六个失败分支逐条断言“各一条 error、零插入”；`insertQuote=false` 不写记录且按钮恢复；`focusedTarget` 抛错不外泄。
- U-15：装→卸后监听/定时器/适配器/位点/locale/订阅计数均归零，历史清空，拆除后不再定稿。
- U-17：`Object.keys(zh).sort()` 与 `en` 深度相等；四类内容文案不出现在任何字典值中。
- U-19 / H-1：跨预览体（锚点 A、终点 B）置灰且强制点击零插入、恰好一条 error；同属 A 时可用（防过度置灰）；终点解析不到或抛错均置灰、无“只判锚点”兜底。

## 5. 人工逐格式回归（AC-13，逐格式结论）

在同一个 `side-quote-verify` 实例、固定视口 `1440x900` 下，用可见插件清单开关切换启用/停用，对同一预览各截一次图。enabled/disabled 截图 SHA256 对照：

| 格式 | 启用截图 | 停用截图 | 渲染对比 | 按钮 | 控制台 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| PDF (`report.pdf`) | `evidence/format-regression/report-pdf-enabled.png` | `evidence/format-regression/report-pdf-disabled.png` | 逐字节相同（SHA256 `6AF45B07…`） | 两阶段均无 | 两阶段均无 error | 通过 |
| PNG (`image.png`) | `evidence/format-regression/image-png-enabled.png` | `evidence/format-regression/image-png-disabled.png` | 逐字节相同（`82182C21…`） | 两阶段均无 | 无 error | 通过 |
| XLSX (`table.xlsx`) | `evidence/format-regression/table-xlsx-enabled.png` | `evidence/format-regression/table-xlsx-disabled.png` | 逐字节相同（`D8E538F4…`） | 两阶段均无 | 无 error | 通过 |
| DOCX (`doc.docx`) | `evidence/format-regression/doc-docx-enabled.png` | `evidence/format-regression/doc-docx-disabled.png` | 逐字节相同（`57724596…`） | 两阶段均无 | 无 error | 通过 |
| HTML (`page.html`) | `evidence/format-regression/page-html-enabled.png` | `evidence/format-regression/page-html-disabled.png` | 逐字节相同（`7AA3880E…`） | 两阶段均无 | 无 error | 通过 |
| 正向对照 `.md` (`a.md`) | `evidence/format-regression/a-md-enabled.png`（按钮存在且无选区时置灰） | `evidence/format-regression/a-md-disabled.png`（按钮消失） | 差异仅来自引用按钮，符合预期 | 启用有 / 停用无 | 无 error | 通过 |

两阶段截图均带同名 `.json` sidecar（revision/端口/profile/视口），汇总见 `evidence/format-regression/format-regression-summary.json`。截图已逐张目视核对：PDF 显示正文、PNG 显示图形、XLSX 显示表格网格、DOCX 显示段落、HTML 显示标题/段落/列表，均真实渲染而非错误占位。

## 6. 未覆盖与残余风险

1. **AC-1 的逐字链只在单元层**：浏览器层证明的是 composer 对 `summary` 的展示（label/摘录）与插入闭环；`insertQuote` 的 `text` 逐字模板由 U-01/U-02 证明。harness 刻意不发送消息，因此“发送后模型收到的正文”未被端到端证明。
2. **选区的真实拖选可达性未证**：E-01…E-07、E-09 的选区由 DOM `Range` 合成（与 harness 文档一致）；E-01 只对“按钮的真实鼠标点击”做硬断言。跨窗格 E-09 同样是合成 Range，不是物理拖选。
3. **error 级通知的可观测性**：平台 error toast 的 ARIA 角色未确证；E-05 绑定的是 info 的 `role === 'status'` 与“零 error 文案”，通知“恰好一条”的计数证据在单元层（U-14）与平台单槽位语义。
4. **e2e 并发脆弱性**：E-08 会真实停用插件；`node --test` 并行跑两个 e2e 文件时，若 formats 用例晚于 E-08 才取正向对照，可能出现假失败（本次 formats 先于停用完成）。这是测试 harness 的时序风险，不是产品缺陷。
5. **`.env` 浏览器用例不适用**：Files 页隐藏点开头条目；仅由 U-10/U-11 覆盖，未在浏览器层执行。
6. **格式回归的帧级等价**：逐字节相同的截图证明该视口、该时刻渲染一致；hover/交互态、其它视口与缩放未纳入。
7. **夹具位置**：本轮夹具临时放在 DSH 默认工作区（运行前为空），验收后已删除；live `3081` 全程只读，未重启/终止。
8. **端口替换**：`3181` → `34181` 依据 §4.1 的保留端口例外；证据 sidecar 记录的是真实端口 `34181`。

## 7. 清理确认

- 已停止本轮 Edge（PID `47780` 进程树）与 `34181` 实例（PID `66464` 进程树）；`34181`/`39222` 无监听残留。
- 已删除临时 `DSH_HOME` 与整套临时目录 `%TEMP%\side-quote-e2e`（含 profile、夹具、日志、临时脚本）。
- 已删除放入默认工作区的本轮夹具；该工作区恢复为 0 个条目。
- `3081` 仍由 PID `67988` 监听，启动时间 `2026-11-15 22:04:50`，未重启、未终止、未改 profile。
- 本次证据（`evidence/e2e/` 与 `evidence/format-regression/`，共 63 个文件）保留；未提交、未推送、未做生命周期转换。

## 8. 结论

**通过。** AC-1…AC-16 全部有可复现证据且判定为通过；E-01…E-09 在本环境执行并通过（E-09 以合成跨窗格 Range 证明跨预览体规则）；`.env` 浏览器用例按环境例外记为不适用并由 U-10/U-11 承担。残余风险见第 6 节，均不改变本次验收结论。