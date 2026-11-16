# I001-F02 独立验证记录

> **结论：通过（无条件）。** 被测 revision `d4f6eab`，本轮提交版端到端 **tests 17 / pass 17 /
> fail 0 / skip 0**（`duration_ms 228838`，墙面 228.9s），单元层 71/54/0（17 项 e2e 无驱动时
> 的 skip，本轮由 e2e 覆盖），人工回归三项全部通过。上一轮（`f0b8318`）提出的 C-1…C-4 已
> 全部关闭，R-2 已按编排者裁决文档化。
> 本记录分两轮：**第 1 轮**（对象 `f0b8318`，发现测试层缺陷）与**第 2 轮**（对象 `d4f6eab`，
> 最终判定）。两轮的证据来源与适用条件在每处标注。

## 0. 两轮概览

| 轮 | 被测 revision | 提交版 e2e 结果 | 结论 | 说明 |
| --- | --- | --- | --- | --- |
| 第 1 轮 | `f0b8318` | tests 17 / pass 6 / fail 11 / skip 0 | 有条件通过 | 产品面经独立补步取证满足 AC-17…AC-30；但 `E-10`…`E-18` 因 4 处测试层缺陷不可执行（H1…H4） |
| 第 2 轮 | `d4f6eab` | tests 17 / **pass 17** / fail 0 / **skip 0** | **通过** | C-1…C-4 已修复且断言被加强（不是弱化）；R-2 已文档化 |

被测产品代码两轮**完全相同**：`code/client.js` blob `9c89b2782e58494cec05dc66de16a8a9a191b679`
（`git rev-parse f0b8318:code/client.js` 与 `git hash-object code/client.js` 相等），
`code/index.js`、`code/package.json` 未变。故第 1 轮用独立驱动取得的浏览器行为证据在第 2 轮
仍然适用（同一份运行时字节）；第 2 轮新增的提交版 e2e 证据与它互为交叉验证。

## 1. 验证对象与来源（第 2 轮）

| 项 | 值 |
| --- | --- |
| 工作仓库 | `D:\dsh-side-quote` |
| 被测 revision | `d4f6eabe551d9823b801c8e67969e4bbd2af74fb`（`d4f6eab`，HEAD） |
| 相对上轮的提交 | `4d9f1ba docs(feature): record the I001-F02 review gate and the disable boundary`、`d4f6eab test(e2e): make the HTML takeover cases executable` |
| `f0b8318..d4f6eab` 改动面 | `code/test/e2e/cdp.mjs`、`code/test/e2e/html-takeover.test.mjs`、`code/test/e2e/formats.test.mjs`、`code/README.md` 与文档；**产品代码零改动** |
| 产品代码身份 | `code/client.js` blob `9c89b278…`（与 `f0b8318` 相同）、`code/index.js`、`code/package.json` 未变（`git diff --stat f0b8318..HEAD -- code/` 不含三者） |
| 评审门 | `evidence/review-gate-record.md`：第 2 轮（`391921a..f0b8318`）**通过**，无 Blocker/High；本轮对象只多测试与文档改动 |
| 工作树 | 只有 `evidence/` 下未跟踪文件（本轮与上轮的证据）；无源码/权威文档改动 |

## 2. 环境（两轮相同，本轮收尾前已回收）

| 项 | 值 |
| --- | --- |
| DSH 实例 | `http://127.0.0.1:34181/`（证据只记 origin+port，**不含** `?token=`） |
| 实例进程 | PID `58124`，启动 `2026-11-16 16:51:40`，`--profile side-quote-verify --no-open --port 34181` |
| `DSH_HOME` | `C:\Users\search\AppData\Local\Temp\side-quote-f02\e2e\dsh-home`，profile `side-quote-verify` |
| 插件安装 | `dsh-side-quote: link:D:/dsh-side-quote/code`（junction 指向仓库当前代码） |
| 浏览器 | headless Edge `157.0.4341.60`，CDP `http://127.0.0.1:39222`（PID `48916`），独立 `--user-data-dir` |
| 视口 | `1440x900`，`deviceScaleFactor: 1` |
| Node / OS | Node `v24.22.2` / Windows |
| live 实例（只读） | `127.0.0.1:3081`，PID `67988` |
| 夹具 | 实例默认工作区 14 个合成件（实现 owner 重建）：`notes/{a.md,b.md,secret.md,server.pem}`、`samples/{page.html,page-csp.html,page-assets.html,extra.css,extra.js,extra.png,image.png,report.pdf,table.xlsx,doc.docx}` |

## 3. 单元层（第 2 轮独立复跑）

```
node --check code/index.js    -> exit 0
node --check code/client.js   -> exit 0
node --test --test-concurrency=1 "code/test/**/*.test.mjs"
  ℹ tests 71  ℹ pass 54  ℹ fail 0  ℹ skipped 17  ℹ duration_ms 487
```

17 个 `skip` 是 `code/test/e2e/*`（理由 `未提供浏览器驱动`），由 §4 覆盖；**不计通过**。

U-20…U-31 的断言逐条核对（与第 1 轮一致，产品代码未变，结论沿用并有本轮复跑支撑）：
U-20 白名单恒不含 `html/htm`（含 `page.HTML`、盘符路径）、`matchesHtmlPreviewPath` 只认 `.html/.htm`；
U-21 五分支（witness 属本 tab 放行且不需要父文档选区、父文档外选区不否决、异 occurrence 置灰且
1 条 `error`/零插入/零记录、抛错与解析不到均不外泄）；U-22 `tab.occurrenceId` 缺失不臆造；
U-23 10 类非法报文静默丢弃且不清空文本（65536 收下、65537 丢弃）；U-24 按 iframe 隔离、卸载删条目、
`dispose()` 移监听；U-25 4000ms 超时 + 迟到 `ready` 恢复 + dispose 后无迟到通知；U-26 闸门真值表、
不重复注册、回落后 `persistedOn` 仍 true；U-27 6 种非法值 + 读写抛错全 fail-closed 且不抛；
U-28 两条卸载路径全归零、W-2 证明卸载路径自行 `revoked === created`；U-29 开启自检各分支恰 1 条、
桥降级按页目标去重、不占点击预算；U-30 只加不减（2 适配器/1 正文/1 按钮/1 开关，文本适配器对
`.html` 恒 false）；U-31 中英 12 键一致且内容文案不入字典。

## 4. 端到端层（第 2 轮）

命令（串行，环境变量见 §2）：

```
node --test --test-concurrency=1 "code/test/e2e/**/*.test.mjs"
ℹ tests 17  ℹ suites 0  ℹ pass 17  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0  ℹ todo 0
ℹ duration_ms 228837.8441     （墙面 228.9s）
```

逐条：

| 用例 | 结果 | 耗时 | 证据（`evidence/e2e/`） |
| --- | --- | --- | --- |
| E-04 其他格式零影响（含 C-13 的 `.html` 断言） | ✔ | 20.6s | `E-04-{0-positive-control,pdf,png,xlsx,docx,pem,html}.{png,json}` |
| E-10 关闭态正文与插件停用逐字节一致 | ✔ | 24.4s | `E-10-0/1/2`、`E-10-3-comparison.json` |
| E-11 开启自检 + 桥报文 opaque origin | ✔ | 7.7s | `E-11-1-takeover-on.{png,json}` |
| E-12 真实拖选引用闭环 | ✔ | 8.0s | `E-12-1-drag-quote.{png,json}`（`selectionDrive: mouse`） |
| E-13 同文件再引（指针块） | ✔ | 8.7s | `E-13-1-pointer.{png,json}` |
| E-14 无选区按钮置灰 | ✔ | 7.0s | `E-14-1-no-selection.{png,json}` |
| E-15 CSP 页面仍可引用 | ✔ | 7.9s | `E-15-1-csp-page.{png,json}` |
| E-16 闸门关闭：一条 error、不接管、开关禁用并说明原因 | ✔ | 11.6s | `E-16-1-gate-closed.{png,json}` |
| E-17 开启后关闭：回自带、按钮消失、后续划词无反应 | ✔ | 8.7s | `E-17-1-closed-again.{png,json}` |
| E-18 停用清理 + 停用边界事实 + 刷新回归 | ✔ | 22.9s | `E-18-0/1`、`E-18-2-disable-boundary.json` |
| E-01 首次引用闭环 | ✔ | 3.8s | `E-01-1/2` |
| E-02 同文件再引 | ✔ | 4.1s | `E-02-1-pointer` |
| E-03 跨文件独立 | ✔ | 3.7s | `E-03-1-other-file` |
| E-05 敏感文件警示 | ✔ | 3.8s | `E-05-1-sensitive` |
| E-06 无选区 | ✔ | 4.0s | `E-06-1-no-selection` |
| E-07 切 tab 后旧选区不可用 | ✔ | 6.3s | `E-07-1-after-tab-switch` |
| E-08 停用清理（F01） | ✔ | 16.2s | `E-08-1-disabled` |

全部 27 张截图的 sidecar 都是 `gitRevision d4f6eab…`、`port 34181`、`profile side-quote-verify`、
`viewport 1440x900`，HTML 接管用例另带 `takeover` / `selectionDrive` / `iframeSandbox`。

### 4.1 关键事实（直接读断言产物，不采信自评）

**E-10（AC-17）** `E-10-3-comparison.json`：

```json
{"clip":{"x":793,"y":76,"width":647,"height":824},"sandboxPhaseA":"allow-scripts",
 "sandboxPhaseB":"allow-scripts","phaseBReloaded":true,
 "bytesA":12647,"bytesB":12647,
 "sha256A":"f81d04e13515d81766f6655d535b52337630c5b95f93e767218440b90de3401e",
 "sha256B":"f81d04e13515d81766f6655d535b52337630c5b95f93e767218440b90de3401e","identical":true}
```

两阶段裁剪区用 `deepEqual` 严格相等（不是"包含"），逐字节相同，`sandbox` 两边都是
`allow-scripts`，停用阶段先断言插件标记全清 + 控制台无 error，再刷新取自带渲染基线。
第 1 轮我用独立驱动在同一产品字节上得到的结论（`evidence/e2e-independent/R1-*`，
sha `ac3768e0…`，fixture 文本不同）与此一致。

**E-11（AC-24）** 断言读的是**父页面**收到的 `message` 事件：每条桥报文
`origin === 'null'`、`source === frame.contentWindow`、`version === BRIDGE_VERSION`，且至少一条
`kind === 'ready'`；同时仍断言 frame 内 `parent.document` 不可达、无宿主全局对象、可向父页面
postMessage。第 1 轮的独立取证 `evidence/manual/R2-ac24-origin.json` 记录了 17 条真实报文
（`origin: "null"`、`fromFrame: true`、`channel: dsh-side-quote/html-bridge`），与此互证。

**E-12/E-13/E-15（AC-19/AC-20/AC-21/AC-29）** 引用改读 composer 的结构化卡片
（`[data-composer-quote]` → `[data-quote-preview-text]`）：
`collapse(card.body) === collapse(iframe 内真实选区)`；卡片元信息匹配
`^samples/page\.html \d+ 行$`；`absolutePath === false`；首次无指针文案；第二次 `card.body`
含 `已引用过`、`meta` 含路径、`text` 不含 `来源：`、不复述首条原文。
第 1 轮独立驱动（`evidence/manual/S3-e12-quote.json`、`S3-e13-pointer.json`）给出同样的配对。

**E-18（AC-27 + R-2）** `E-18-2-disable-boundary.json` 把边界记成事实而非通过条件：

```json
{"bodyAfterDisable":{"takeover":[],"builtin":[],"body":0},
 "bodyAfterReload":{"takeover":[],"builtin":[{"sandbox":"allow-scripts","src":"blob:…","srcdoc":false}],"body":0}}
```

停用后先断言全部插件标记消失、控制台无 error、旧 `blob:` 无任何元素继续引用；刷新后断言自带
渲染回归且旧 blob 仍无残留；随后在自带 iframe 内真实拖选，composer 卡片集合 `deepEqual` 不变。

### 4.2 C-1…C-4 的关闭核对（是否真的修好，而不是弱化）

| 项 | 状态 | 核对方式 |
| --- | --- | --- |
| C-1 设置入口 | **已关闭** | `cdp.mjs` 新增 `openSettingsDialog`：先试 shell `aria-label` 触发器，否则打开 `账号菜单` 并点 `menuitem` 设置（`settingsMenuItemExpression` 用前缀匹配以容纳 `设置Ctrl+Alt+,`），返回所用路由。`E-11`…`E-18` 本轮全部进入产品断言，无一超时 |
| C-2 停用阶段 | **已关闭** | 新增 `ensureRightSidebar` + `reloadAndReopenPreview`；`E-10` 用 `deepEqual(clipB, clip)` 取代 `clipContains`，并断言 `sandboxPhaseB !== null`、`body === 0`、停用瞬间 `consoleErrors === []`、`phaseBReloaded: true` 写进证据；`E-18` 把空白事实写进 `E-18-2-disable-boundary.json` 并追加刷新回归断言 |
| C-3 opaque origin | **已关闭** | 删除 isolated world 里的 `origin` 读取（并注明它在 sandboxed blob 上必然返回 URL origin，平台自带 frame 同样如此），改为 `startBridgeMessageRecorder` 在 frame 挂载**前**装在父页面，断言 `origin==='null'`、`fromFrame`、`version`、`ready` |
| C-4 卡片解析 | **已关闭** | 删除 `parseQuoteBlock`，新增 `readComposerQuotes` / `waitForComposerQuotes` / `waitForAppendedCard`（按子节点顺序取 label/meta/body，避开哈希类名）；断言从"含某子串"升级为"逐字相等 + 元信息形状 + 单次点击只追加一张卡" |

判定：**四项都是实质修复，断言强度上升**。`E-14`/`E-16`/`E-17` 的判定逻辑也同步改用卡片
`deepEqual`，并新增"只追加一张卡"的计数断言，未出现放宽或跳过。

## 5. 验收标准逐条判定（AC-17…AC-30，第 2 轮）

| ID | 判定 | 本轮证据（`evidence/e2e/`） | 交叉验证（第 1 轮独立驱动，同一产品字节） |
| --- | --- | --- | --- |
| AC-17 | **通过** | E-10：`E-10-3-comparison.json`（`identical: true`、`deepEqual` 裁剪区、双阶段 `allow-scripts`） | `e2e-independent/R1-*`（独立两阶段，sha 相同） |
| AC-18 | **通过** | E-10 关闭态（`pressed=false`、无引用按钮）；unit U-27 | `e2e-independent/S1-0-closed-header` |
| AC-19 | **通过** | E-11（恰 1 条 `status`、正文接管、自带消失、按钮置灰）+ E-12（真实拖选 → 按钮可用 → 真实点击 → 卡片正文逐字等于选区） | `manual/S3-e12-quote.json` |
| AC-20 | **通过** | E-13（指针卡片，含 `已引用过` 与路径，无 `来源：`，不复述原文） | `manual/S3-e13-pointer.json` |
| AC-21 | **通过** | E-12 `card.meta` 匹配 `^samples/page\.html \d+ 行$`、`absolutePath === false`；E-13/E-15 同 | F01 U-09 复用 |
| AC-22 | **通过** | unit U-21/U-22；E-14（无选区置灰） | 第 1 轮 E-14 |
| AC-23 | **通过** | E-04（`.html` 无引用按钮 + 有接管开关；pdf/png/xlsx/docx/pem 均无按钮无开关）；unit U-20/U-30 | 第 1 轮 E-04 |
| AC-24 | **通过** | E-11 父侧报文断言（`origin==='null'` / `fromFrame` / `version` / `ready`）+ frame 内不可达宿主；unit U-23/U-24 | `manual/R2-ac24-origin.json`（17 条真实报文） |
| AC-25 | **通过** | E-16（恰 1 条 `error`、不接管、开关禁用且 `title`+`aria-describedby` 双说明、无 `data-side-quote-html*`）+ E-15（CSP 页仍可引用）+ E-17 | `manual/S5-gate-flip.json`（挂载中闸门真假双向，`persistedOn` 保持开）、`R4-csp.json` |
| AC-26 | **通过** | E-11（恰 1 条 `status`，600ms 内不重复）+ E-16（恰 1 条 `alert`，0 条 `info`）；unit U-29 | `manual/S2-e11-self-check.json` |
| AC-27 | **通过（R-2 已文档化）** | E-17（开→关回自带、按钮消失、控制台无 error、自带内拖选不追加卡片）+ E-18（停用瞬间全清、无 error、无残留 blob；刷新后自带回归；再拖选无卡片）；unit U-28/W-2 | `manual/S6-e18-disable.json` |
| AC-28 | **通过** | 全部 sidecar：`d4f6eab…` / `34181` / `side-quote-verify` / `1440x900`，无 `?token=`；§7 的 3081 一致性 | 第 1 轮同样结论 |
| AC-29 | **通过** | E-12/E-13/E-15 卡片正文 == 渲染选中文本；指针/模板沿用；unit U-01…U-11 复用 | `manual/S3-*`、`R4` |
| AC-30 | **通过** | unit U-31（12 键中英一致、内容文案不在字典） | 第 1 轮同样结论 |

F01 的 AC-1…AC-16 继续有效：本轮 `E-01`…`E-08` **8/8 通过**；AC-7 的 `.html` 断言已按 C-13
改写为"关闭时无引用按钮、有接管开关"，`E-04` 实测通过。

## 6. 人工回归层（第 2 轮，`evidence/manual-final/`）

| # | 项目 | 判定 | 证据与要点 |
| --- | --- | --- | --- |
| 1 | 同一 `samples/page.html`：自带 vs 接管各截图，目视可读、可选中 | **通过** | `M1-1-page-builtin.png` / `M1-2-page-takeover.png`（同裁剪区 `793,76,647×824`；接管截图 sha `f81d04e1…` 与 E-10 两阶段一致）；目视：标题、两段、两条列表项清晰，行内样式生效；真实拖选后按钮可用，`selected: "The quick brown fox jumps over the lazy"` |
| 2 | `samples/page-assets.html`：外部 CSS/JS/图片未加载、文字可读可选、无向 DSH 端口的相对请求 | **通过** | `M2-1-assets-page.png`、`M2-assets.json`：CDP `Network` 采集期内 `extra.css/js/png` **零请求**；目视为浏览器默认渲染（外部 CSS 未生效）、图片位置显示 alt 文本而非图片；真实拖选后可引用（`HTML assets preview fixture` 前段被选中） |
| 3 | `samples/page-csp.html`：按自身 CSP 渲染、桥仍可用 | **通过** | `M3-1-csp-page.png`、`M3-csp.json`：页面正常渲染；真实拖选 → 按钮可用（`HTML CSP preview fixture`） |
| 4 | 逐项写"通过/失败/不适用" | **通过** | 本表三项均"通过"；`manual-summary.json` 记录 `pass/pass/pass` |

页面内 CSP `meta` 与"注入脚本不依赖页面 CSP"的结构结论沿用第 1 轮
`manual/R4-csp.json`（同一 `client.js` 字节），本轮 `E-15` 再次实测通过。

## 7. 隔离与安全 / 收尾

| 项 | 收尾前 | 收尾后 |
| --- | --- | --- |
| `3081` PID / 启动时间 | `67988` / `2026-11-15T22:04:50.9420764+08:00` | `67988` / `2026-11-15T22:04:50.9420764+08:00`（一致，全程只读） |
| `34181` 监听 | PID `58124`（`--profile side-quote-verify --port 34181`） | **无监听**（已停止） |
| `39222` 监听 | PID `48916`（headless Edge，8 个子进程） | **无监听**（整棵进程树已停止） |
| live profile | 未写入 | 未写入（插件只装 `side-quote-verify`，`link:D:/dsh-side-quote/code`） |
| 证据中的 token | — | 全部 sidecar 只记 `http://127.0.0.1:34181/`；`Select-String "token="` 无命中 |

**夹具回收**：实例默认工作区 14 个夹具已全部删除，`notes/`、`samples/` 目录一并移除，工作区
子项数为 **0**；删除清单留在 `%TEMP%\side-quote-f02\fixtures-final-before-cleanup.txt`。

## 8. 未覆盖与残余风险

- **R-2（文档化的已知边界，不再是验收条件）**：接管开启时停用插件，已打开的预览 tab 正文为空
  （右侧栏可能整体收起、tab 仍在），**刷新页面后**才由自带实现渲染。已按编排者裁决写入
  `code/README.md` HTML 取舍第 10 条与 `core/implementation.md` §9，并在 `E-18-2-disable-boundary.json`
  固化为事实记录；`E-10`/`E-18` 先断言清理、再刷新取自带基线。**用户可见影响仍在**：该场景下
  用户需要手动刷新；这是平台侧行为，本 Feature 不修产品代码。
- **R-3（低，证据形式）**：`E-10-3-comparison.json` 与 `E-18-2-disable-boundary.json` 是测试自写
  的汇总文件，没有 `gitRevision` 字段（同批截图的 sidecar 都有）。不影响判定，但后续若做自动化
  证据校验需补字段。
- **R-4（中，已接受边界）**：页面脚本与桥同 realm，可伪造选区上报、无令牌；页面拿不到按钮、
  `insertQuote`、会话作用域或宿主对象，插入仍需用户点击。**不等于"已验证安全"**。
- **R-5（中，已知耦合）**：`focusedTarget(iframeElement)` 的非焦点用法属"实现能力 > 文档承诺"，
  DSH 收紧时表现为按钮置灰而非插错文件；`code/client.js` 与 `0.2.2-rc.3` 强耦合，升级 rc 后必须
  重跑单元层与端到端层（`E-01`…`E-18` 与 §3）。
- **R-6（低，未覆盖）**：HTML 预览的跨 tab 归属只在单元层（U-21/U-22）与无选区用例（E-14）覆盖，
  未做浏览器层跨 tab 实测；桥伪造能力按要求不测。
- **R-7（低，环境）**：本轮把隔离实例的 `developerTools.enabled` 留在 `true` 并清除了接管键；
  实例与浏览器已停止，该状态随临时 `DSH_HOME` 一起回收。

## 9. 结论

**通过（无条件）。** 依据：

1. 单元层独立复跑 71/54/0（17 项 e2e skip 已由端到端层覆盖，无 fail）。
2. 提交版端到端串行全量 **17/17 通过，skip = 0**，`duration_ms 228838`。
3. `E-10`…`E-18` 均进入产品断言；C-1…C-4 的修复使断言强度上升（`deepEqual` 裁剪区与逐字节
   对比、父侧 opaque origin、卡片正文与真实选区逐字相等、单次点击只追加一张卡）。
4. 人工回归三项逐项目视 + 网络/结构佐证通过。
5. AC-17…AC-30 全部可判定为"通过"，F01 的 AC-1…AC-16 继续有效（`E-01`…`E-08` 本轮 8/8）。
6. 隔离有效：证据全部绑定 `d4f6eab` + `34181` + `side-quote-verify` + `1440x900` + 接管状态 +
   驱动方式 + `sandbox`；`3081` 全程只读且 PID/启动时间一致；收尾后 `34181`/`39222` 无监听。

仅存的用户可见限制已按裁决文档化为 R-2，不再是验收条件，也不阻断本 Feature 的
`acceptance.passed`。

## 10. 证据索引

| 位置 | 内容 | 适用轮次 |
| --- | --- | --- |
| `evidence/e2e/` | 第 2 轮提交版全套 e2e：27 张截图 + sidecar + `E-10-3-comparison.json` + `E-18-2-disable-boundary.json` | `d4f6eab` |
| `evidence/manual-final/` | 第 2 轮人工回归：`M1`（自带 vs 接管）、`M2`（外部资源）、`M3`（CSP）+ `manual-summary.json` | `d4f6eab` |
| `evidence/e2e-independent/` | 第 1 轮独立补步证据：`R1`（两阶段）、`R2`（父侧 origin）、`R3`（assets）、`R4`（csp）、`S1`…`S8` | `f0b8318`（产品字节与 `d4f6eab` 相同） |
| `evidence/manual/` | 第 1 轮结构断言、composer DOM 实测、停用前后状态、驱动脚本与 `cdp` 补丁（`scripts/`） | `f0b8318` |
| `evidence/e2e-f0b8318-partial/` | 第 1 轮提交版 e2e 的部分产物（保留失败事实，未删除） | `f0b8318` |
| `evidence/review-gate-record.md` | 评审门记录（第 2 轮通过，由评审角色产出） | `27d60ee..f0b8318` |
