# I001 Initiative 集成验收运行记录（唯一证据根）

> 结论：**PASS**。矩阵 8 行全部通过（I-01…I-08），诊断行 I-D01 附命令结果。
> 本文件是 Phase C 登记的 `integration_testing.evidence` 目标；证据根是本目录
> （`integration-testing/`），与两个 Feature 各自的 `evidence/` 分离、互不复用。
> 冻结的验收口径见 [integration-acceptance-matrix.md](integration-acceptance-matrix.md)；
> 交接见 [integration-test-handoff.md](integration-test-handoff.md)。

## 1. 运行身份与精确环境

| 项 | 值 |
| --- | --- |
| 受测来源 | `D:\dsh-side-quote`，`main` @ `ff44221d013b5141afed2d484f9ceccc8cd22c69`（`ff44221`） |
| 受测产品代码 | `code/client.js` blob `9c89b2782e58494cec05dc66de16a8a9a191b679`（`git hash-object code/client.js`，与 F02 验收时的产品字节相同）；`code/index.js`、`code/package.json` 未变 |
| 受测范围 | 该 revision 的 `code/`（唯一实现文件 `code/client.js`，2094 行）+ `code/test/e2e/cdp.mjs` harness；无未提交源码改动（本行两侧工作树中 `code/` 无 diff） |
| 运行时刻（UTC / 本地） | 主运行 `2026-11-16T11:20:43.855Z` → `11:22:00.218Z`（本地 `19:20:43` → `19:22:00`，Asia/Hong_Kong） |
| DSH_HOME | `%TEMP%\side-quote-i001-integration\dsh-home`（临时；**不是** `%USERPROFILE%\.dsh`，本会话不触碰真实 home） |
| profile | `side-quote-verify`（`dsh --profile side-quote-verify --from-default-profile web --dump-config` 新建） |
| 插件安装 | `dsh plugin --profile side-quote-verify add D:\dsh-side-quote\code` → `dsh-side-quote: link:D:/dsh-side-quote/code`（只进该临时 profile） |
| 实例 | `http://127.0.0.1:34181/`，PID `70152`，启动 `2026-11-16T19:03:37.8845634+08:00`，命令行 `node …dsh\lib\bin.js --profile side-quote-verify --no-open --port 34181` |
| 端口 | `34181`。契约默认 `3181` 落在本机 Windows TCP 保留段 `3119–3218`（`netsh interface ipv4 show excludedportrange protocol=tcp` 本轮复核仍在该段内），按两个 Feature 文档 §4.1 的既有环境例外替换；替换不改变「独立实例、与 live 3081 分离」的意图 |
| 浏览器 | headless Edge `Edg/157.0.4341.60`，PID `45372`，`--remote-debugging-port=39261`，独立 `--user-data-dir` |
| 视口 | `1440x900`，`deviceScaleFactor: 1`（每张 sidecar 记录） |
| 运行时 | Node `v24.22.2`；Windows `10.0.26200`；DSH `0.2.2-rc.3` |
| live 实例（只读） | `127.0.0.1:3081`，PID `67988`，启动 `2026-11-15T22:04:50.9420764+08:00`；验收前后 PID 与启动时间一致，未重启、未终止、未写入其 profile |
| 夹具 | 实例默认工作区合成件（列于 §4），运行后删除；仓库内不存在名为 `.env` 的文件 |

## 2. 覆盖的 Feature 与依赖链

- `I001-F01` 文本预览划词引用（`ready-to-merge / ready`，`depends_on: []`）
- `I001-F02` HTML 预览接管适配（`ready-to-merge / ready`，`depends_on: [I001-F01]`）

本次运行覆盖的**跨 Feature 共享面**（不是两条独立路径的拼接）：

1. 同一个插件实例、同一个浏览器页面目标（`pageTargetId` 记录在 `evidence/integration-summary.json`）内的连续操作序列；
2. 同一条 `insertQuote` / `notify` 通道：两侧引用落到同一个 composer 卡片流（一次点击只追加一张卡）；
3. 同一个「已引用记录」空间（键 `sessionId + 工作区相对路径`，插件内存、停用清空）：文本文件与 HTML 文件共用同一记录，互不分区；
4. 同一套内容契约：来源路径相对化、200 行 / 8000 字符先到先截、截断说明、`summary` 形状、敏感名只警示不拦截、通知预算；
5. 同一套头部位点（`sidebar.right.tab.document.actions`）：文本引用按钮、接管开关、HTML 引用按钮三者互不串场；
6. 同一生命周期：插件停用时两侧控件与 iframe 一起消失、停用后无残留监听、重新启用后两侧同时恢复。

## 3. 验收矩阵逐行结果

| ID | 状态 | 决定性观察（读断言产物，不采信自评） | 证据 |
| --- | --- | --- | --- |
| I-01 跨 Feature 共享记录连续性 | **PASS** | 同一页面会话内 4 次点击、4 张新卡片：①`notes/a.md` 原文块（`quick brown fox`，`1 行`，无截断说明、无绝对路径）；②`samples/page.html` 原文块（真实鼠标在 iframe 内拖选 `The quick brown fox jumps over the lazy dog`，卡片正文与之逐字一致）；③`samples/page.html` 指针块（`已引用过：samples/page.html 原文未重复贴出；需要时请重新读取该文件。`，不含 `来源：`、不含原文）；④切回 `.md` tab 后 `notes/a.md` **指针块**。④是本行关键：Assertion 证明 F01 的已引用记录被 F02 的插入路径共享（未重置、未分区）。触发器路径全部 `mouse`；接管自检恰好 1 条 `info` | `I-01-a-text-original`、`I-01-b-html-takeover`、`I-01-c-html-pointer`、`I-01-d-text-pointer`（png+json）；`integration-summary.json` → `rows[0].steps` |
| I-02 头部控件互不串场 | **PASS** | 四种组合全部实测：`.md`（接管关/开）均 `textButton=true`、`toggle=false`、`htmlButton=false`；`.html` 接管关 `toggle=true/aria-pressed=false`、`textButton=false`、`htmlButton=false`；接管开 `toggle=true/pressed`、`htmlButton=true`、`textButton=false` | `I-02-a-md-controls`；`controls[]` 四行快照 |
| I-03 接管开关对非 HTML 格式零影响 | **PASS** | 持久开关为 `'on'` 时：`notes/b.md` 文本按钮可用并成功插入原文块（`notes/b.md`，未降级指针）；`report.pdf`、`image.png` 无文本按钮、无接管开关、无 HTML 引用按钮；窗口内控制台 error 为 0 | `I-03-a-png-no-controls`；`rows[2].observed` |
| I-04 闸门为假时 `.md` 路径完全不受影响 | **PASS** | 通过 Settings UI 把脚本闸门置假后：`.md` 仍有按钮、划词后按钮可用、插入成功（`notes/secret.md`），敏感名恰好 1 条 `info`（`role='status'`）、0 条 `error`；`.html` 不接管（`takeoverFrames=0`、`builtinFrames>=1`）、无 HTML 引用按钮、开关 `pressed=true` 但 `disabled=true` 且给出可读原因（`需要先开启「开发者工具」（页面脚本）才能接管预览。`，同时出现在 `title` 与 `aria-describedby`）；把闸门恢复为真后**不刷新页面**即重新接管（`takeoverFrames=1`、HTML 按钮回来、开关可用），持久开关未被静默改写 | `I-04-a-md-with-gate-closed`、`I-04-b-html-gate-closed`、`I-04-c-html-gate-restored`；`controls[]` 中 `html/gate-false` 与 `html/gate-restored` |
| I-05 两侧共用内容契约在同一会话同时成立 | **PASS** | 同一会话内：`notes/long.txt`（260 行 / 16 380 字符）→ 原文块 `notes/long.txt 129 行（已截断）` 且含截断说明；`samples/long.html`（120 段渲染文本，iframe 内大范围选区，驱动方式记为 `synthetic-range`）→ `samples/long.html 162 行（已截断）` 且含同一截断说明；两侧均无盘符绝对路径；`samples/page-csp.html` 首次引用为原文块。通知预算：三次插入后新增通知均为 **0**（文本截断、HTML 截断、CSP 页各 0 条 error / 0 条 info）；敏感名命中的那一条 `info` 已由 I-04 单独计数 | `I-05-a-text-truncated`、`I-05-b-html-truncated`；`rows[4].truncation` 与 `rows[4].budget` |
| I-06 负向路径 | **PASS** | `.md` 无选区 → 按钮存在且 `disabled`；HTML 接管开、无选区 → HTML 引用按钮存在且 `disabled`；`.md` 划词后切到 HTML tab 再切回，旧选区不可用（按钮 `disabled`）；卡片数 31 → 31，零插入 | `I-06-a-cross-tab-stale`；`rows[5]` |
| I-07 安全边界 | **PASS** | `sandbox` 恰为 `allow-scripts`（恒不含 `allow-same-origin`）；frame 内 `parent.document` 不可达（`parentReachable=false`）、无宿主全局对象（`hostGlobals=[]`）、可单向 postMessage；父页面记录的 62 条桥报文中 **全部** `origin='null'`、`source === frame.contentWindow`、`version=1`，其中 7 条 `ready`、55 条 `selection`；证据文件不含启动地址的 `?token=`（见 §6） | `I-07-a-frame-isolation`；`rows[6].bridge`、`security` |
| I-08 停用与恢复（两侧同时） | **PASS** | 接管开启且文本按钮亦存在时停用插件：文本引用按钮、接管开关、HTML 引用按钮、接管正文全部消失，控制台 error 0，旧 `blob:` 无元素继续引用；停用后划词不再产生卡片（计数不变）；重新启用并整页刷新后，接管正文与文本按钮同时恢复，持久开关仍为 `on`。「已打开的 HTML 预览正文在停用后为空、刷新后才回归」按已知边界记为事实（`bodyAfterDisable` / `builtinFrameAfterDisable=0`），**不判缺陷** | `I-08-a-disabled`、`I-08-b-reenabled`；`rows[7]`、`teardown` |

矩阵外诊断行：

| ID | 结果 | 内容 |
| --- | --- | --- |
| I-D01 命令层取样 | PASS（诊断，不单独决定 PASS） | `node --check code/index.js` exit 0、`node --check code/client.js` exit 0；单元层 `tests 71 / pass 54 / fail 0 / skipped 17`（17 项 skip = 未提供浏览器驱动，记「未执行」，由端到端层覆盖）；提交版端到端串行全量 `tests 17 / pass 17 / fail 0 / skipped 0`（`duration_ms 229864.7295`） |

## 4. 执行命令与退出码

全部命令在 `D:\dsh-side-quote` 下执行；命令只取自 `.factory/factory.yaml` 命令表（`lint` / `test` / `e2e`），
不含临时发明的命令。跨 Feature 主链路用本目录的 `scripts/integration-run.mjs` 驱动（仅复用
`code/test/e2e/cdp.mjs`，不新增依赖、不改命令表）。

| 命令 | 退出码 | 关键输出 | 原始日志 |
| --- | --- | --- | --- |
| `node --check code/index.js` | 0 | — | `raw/unit.log` |
| `node --check code/client.js` | 0 | — | `raw/unit.log` |
| `node --test --test-concurrency=1 "code/test/**/*.test.mjs"` | 0 | `tests 71 / pass 54 / fail 0 / skipped 17 / duration_ms 468.7014` | `raw/unit.log` |
| `node --test --test-concurrency=1 "code/test/e2e/**/*.test.mjs"`（四个 `SIDE_QUOTE_E2E_*` 齐全） | 0（第 2 次） | `tests 17 / pass 17 / fail 0 / skipped 0 / duration_ms 229864.7295` | `raw/e2e-committed-suite.log` |
| 同上（第 1 次，夹具短语不匹配） | 1 | `fail 2`：E-03 / E-05 找不到夹具短语 | `raw/e2e-attempt-1-fixture-mismatch.log` |
| `node …/integration-testing/scripts/integration-run.mjs`（第 3 次＝权威运行） | 0 | `rows: I-01=PASS I-02=PASS I-03=PASS I-04=PASS I-05=PASS I-06=PASS I-07=PASS I-08=PASS`，`failures: none` | `raw/run-3-authoritative.log` |
| 同上（第 1 次） | 1 | 全部行 FAIL，根因＝基线缺陷：在已加载页面之后才启用插件，该页面不会加载 bundle | `raw/run-1-plugin-not-active.log` |
| 同上（第 2 次） | 1 | I-01…I-04、I-06…I-08 PASS，I-05 FAIL（长文本选区读取与渲染竞态，未轮询） | `raw/run-2-page-session.log`、`raw/run-2-summary.json` |

失败事实保留说明（不隐去、不改写成通过）：

- 端到端第 1 次失败的根因是**夹具短语**（操作者提供的合成夹具文本未包含 `different document body` /
  `DEMO_SECRET=placeholder`），不是产品缺陷；补齐夹具后第 2 次 17/17。同一事实在 Leaf 阶段也出现过
  （F01 验收记录 §3「夹具不在实例默认工作区」）。
- 集成第 1、2 次失败的根因都在**本轮自建的驱动脚本**（基线页序、选区读取未轮询），产品代码与
  提交版 harness 未因此改动；修复后第 3 次全绿。产品字节 `9c89b278…` 三次运行完全相同，所以第 3 次
  不是「换了产品去跑通」。

## 5. 跨 Feature 契约断言（逐条对应）

| 断言 | 结论 | 证据位置 |
| --- | --- | --- |
| 两 Feature 共用同一「已引用记录」：文本文件二次引用在 HTML 引用之后仍降级为指针块 | 成立 | I-01 步骤④（`rows[0].steps[5].pointerMeta = "notes/a.md 已引用过"`） |
| HTML 二次引用同样降级为指针块，且两格式互不分区 | 成立 | I-01 步骤③ |
| 一次点击只追加一张卡片（无重复插入、无并发插入） | 成立 | `waitForAppendedCard` 在每行断言 `before + 1` 精确相等 |
| 来源路径统一为工作区相对路径（两格式一致，无盘符、无前导 `/`） | 成立 | 每张卡片 `absolutePath === false`；卡片 `meta` 形如 `notes/a.md 1 行`、`samples/page.html 1 行` |
| 截断规则两侧共用（200 行 / 8000 字符先到先截 + 同一说明文案） | 成立 | `notes/long.txt 129 行（已截断）`、`samples/long.html 162 行（已截断）`，两者正文均含同一 `…（摘录已截断，仅保留前 200 行 / 8000 字符）` |
| `summary` 形状两侧一致（`<path> N 行` / `<path> 已引用过`） | 成立 | I-05 `truncation`、I-01 步骤③⑤ |
| 通知预算：成功插入不通知；敏感名恰一条 `info`；开关自检恰一条 `info`；失败才 `error` | 成立 | I-05 `budget` 三项均 `[]`；I-04 敏感 1 条 `status`、0 条 `alert`；I-01 自检 1 条；I-06/I-08 零 error |
| 头部控件互斥且不串场（`.md` 永无开关，`.html` 永无文本按钮） | 成立 | I-02 四组合、I-03 非 HTML 格式 |
| 闸门语义只作用于 HTML 接管，不波及文本路径 | 成立 | I-04（闸门假时 `.md` 插入成功、HTML 回落自带；闸门恢复后无刷新重新接管） |
| 插件停用同时回收两侧资源，重启用后两侧同时恢复 | 成立 | I-08 |

## 6. 负向路径与安全 / 脱敏结果

- **负向路径**：无选区（`.md`、HTML 各一次）→ 两侧按钮 `disabled`；跨 tab 旧选区 → 不可用且零插入
  （卡片 31→31）；闸门关闭 → HTML 不接管但仍可用文本路径；插件停用 → 全部控件消失、后续划词无卡片。
- **安全边界**：iframe `sandbox` 恰为 `allow-scripts`；frame 内不可达 `parent.document`、无宿主对象；
  父侧收到的 62 条桥报文全部 `origin='null'`、`source === frame.contentWindow`、`version=1`。
  **本记录不声称「桥已验证安全」**：页面脚本与桥同 realm 可伪造上报且无令牌，属两个 Feature 已登记的
  接受边界；本次只证明「可观察面＝四重校验生效、无宿主对象外泄」。
- **脱敏**：所有 sidecar 只记 `http://127.0.0.1:34181/`（origin + path），不含 `?token=`；对
  `integration-testing/` 全目录做了两次扫描——`token=` 字面量只出现在本目录两份**规则说明文字**中
  （本文件与验收矩阵的「不含 `?token=`」条款），真实 boot token 值 0 次命中；仓库内不存在名为 `.env`
  的文件；夹具内容全为合成占位（`DEMO_SECRET=placeholder` 等），无真实机密。

## 7. 复用与来源声明（不把 Leaf 证据当跨 Feature 证据）

| 复用项 | 来源 | 适用条件与本轮处置 |
| --- | --- | --- |
| 非 HTML 格式渲染等价（`.pdf` / `.png` / `.xlsx` / `.docx` 与插件停用逐字节一致） | F01 `evidence/format-regression/format-regression-summary.json`（`f5dadaa`）、F02 `evidence/e2e/E-10-3-comparison.json`（`d4f6eab`） | 本轮未重跑「两阶段逐字节对比」：它需要「停用插件 → 整页刷新 → 重新建立基线」的破坏性重置，会中断 I-01 要求的同一会话连续序列。本轮改以 I-03（接管开关为开时 `.pdf`/`.png` 无任何插件控件）与 I-08（停用后无残留、重启用后恢复）承担**当前运行**的证据，`byte-equality` 结论按上述历史证据沿用，并在矩阵中标注为 historical capability evidence |
| F01 AC-1…AC-16 / F02 AC-17…AC-30 的产品面结论 | 两个 Feature 的 `evidence/verification-record.md` | 仅用于对照「既有能力未被破坏」；本轮所有跨 Feature 行均为新执行。产品字节 `9c89b278…` 与 F02 验收时相同，故历史结论对同一运行时字节仍适用 |
| 提交版端到端 17/17 | 本目录 `raw/e2e-committed-suite.log` | 本轮新执行（不是复用 Leaf 结果），但它只证明各自能力，不替代 I-01 的连续链路 |

## 8. 夹具清单（运行后已删除）

实例工作区（DSH 默认工作区，运行前为空）：`notes/{a.md,b.md,secret.md,server.pem,long.txt}`、
`samples/{page.html,page-csp.html,page-assets.html,long.html,extra.css,extra.js,extra.png,report.pdf,image.png,table.xlsx,doc.docx}`。
全部为合成内容（占位 token、合成 PEM 头、1×1 PNG、最小 PDF/OOXML 容器），无真实机密。

## 9. 未解决项与操作后续（不改变本次门禁结果）

1. **环境回收**：隔离实例（PID `70152`）、headless Edge（PID `45372`）与临时 `DSH_HOME` 在本次运行结束后
   回收；`side-quote-verify` 只存在于临时 home，live profile 从未被写入。
2. **harness 归属**：跨 Feature 驱动脚本位于本证据根 `scripts/integration-run.mjs`，未进 `code/`
   命令表（避免把一次性验收驱动变成产品测试资产）。若后续需要常规化，应作为新的 Feature 变更讨论。
3. **已知边界（沿用，不修）**：接管开启时停用插件，已打开的 HTML 预览正文空白直到整页刷新
   （`code/README.md` 已知取舍第 10 条）；桥与页面同 realm 可伪造、无令牌；`focusedTarget(iframe)`
   属「实现能力 > 文档承诺」；手写 bundle 与 DSH `0.2.2-rc.3` 强耦合，升级 rc 后必须重跑两侧单元层与
   端到端层。
4. **会话草稿残留（观察项）**：同一 DSH 会话在多次尝试之间保留了 composer 草稿，因此权威运行的
   composer 起始时已含前两次尝试产生的卡片。每行断言均以「点击前计数 → 点击后 `before+1` 精确相等」
   判定，不依赖起始为空；该残留不影响任何判定，但说明「干净 composer」不是本次运行的前提。

## 10. 清理确认

- 已停止隔离实例与 headless Edge，`34181` / `39261` 无监听残留；
- 已删除临时 `DSH_HOME`、Edge `--user-data-dir` 与全部夹具（实例工作区恢复为空）；
- `3081` 仍由 PID `67988` 监听、启动时间未变（`2026-11-15T22:04:50.9420764+08:00`），全程未重启、
  未终止、未改其 profile；
- 本证据根（`evidence/` 15 组截图 + sidecar、`integration-summary.json`、`raw/` 6 份原始日志、
  驱动的 `scripts/integration-run.mjs`）保留，作为本次运行的不可变证据。

## 11. 结论

**Initiative 集成验收 PASS。** 8 个阻断行全部通过，且跨 Feature 的共享面（同一插件实例、同一已引用
记录空间、同一插入/通知通道、同一内容契约、同一头部位点、同一生命周期）是**同一次运行内连续验证**的
结果，而不是两个 Feature 各自通过的拼接。两个 Feature 的既有验收结论对同一产品字节继续有效，
未因本次集成运行产生任何 `RE-SCOPED` 或 `REVISED` 行。
