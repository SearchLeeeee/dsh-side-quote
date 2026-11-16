# I001 Initiative 集成验收矩阵（冻结）

> 状态：**冻结于执行前**（frozen before execution）。本文件是 Phase A 的验收矩阵；执行结果写在
> [integration-run-record.md](integration-run-record.md)，本文件在运行开始后不再改写结论口径。
> 冻结时间：2026-11-16T19:30（本地，Asia/Hong_Kong）。
> 生成来源：`feature_workspace.py initiative-integration-handoff --initiative I001`
> （见 [integration-test-handoff.md](integration-test-handoff.md)）。

## 1. 运行身份（冻结字段；实测值由运行记录复核）

| 项 | 冻结值 |
| --- | --- |
| 工作仓库 | `D:\dsh-side-quote`，`main` @ `ff44221`（工作树 clean；本目录与交接文件为本次新增） |
| 被测产品代码 | `code/client.js`（唯一实现文件）、`code/index.js`、`code/package.json`；运行记录写入 `git hash-object` 结果 |
| 隔离实例 | 临时 `DSH_HOME`（`%TEMP%\side-quote-i001-integration\dsh-home`）+ profile `side-quote-verify` |
| 端口 | `34181`。契约默认 `3181` 落在 Windows TCP 保留段 `3119–3218`（`netsh interface ipv4 show excludedportrange protocol=tcp` 可复现），按两个 Feature 文档 §4.1 的既有环境例外替换；替换原因与原始输出写入运行记录 |
| 浏览器 | 独立 headless Edge `Edg/157.0.4341.60`，独立 `--user-data-dir`，CDP `127.0.0.1:39261` |
| 视口 | `1440x900`，`deviceScaleFactor: 1` |
| live 实例（只读） | `127.0.0.1:3081`，PID `67988`（启动 `2026-11-15 22:04:50`）；全程不重启、不终止、不写入 |
| 基线 | 同一浏览器页面目标、同一 DSH 会话；插件启用；接管键清空（关闭）；脚本闸门取值由运行期从 Settings 读取后记录 |
| 夹具 | 实例工作区合成件，运行后删除：`notes/{a.md,b.md,secret.md,server.pem,long.txt}`、`samples/{page.html,page-csp.html,page-assets.html,extra.css,extra.js,extra.png,report.pdf,image.png,table.xlsx,doc.docx,long.html}`；全部合成内容、无真实机密；仓库内不出现名为 `.env` 的文件 |
| 命令 | 只取自 `.factory/factory.yaml` 命令表：`lint`（两条 `node --check`）、`test`、`e2e`；跨 Feature 主链路由本目录 `scripts/integration-run.mjs` 驱动（复用 `code/test/e2e/cdp.mjs`，不新增依赖、不改命令表） |

## 2. 覆盖的 Feature 与依赖链

- `I001-F01` 文本预览划词引用（通用核心 + 文本格式适配）：`ready-to-merge / ready`
- `I001-F02` HTML 预览接管适配：`ready-to-merge / ready`，`depends_on: [I001-F01]`
- 依赖链：F01 核心 →（F02 只新增一个适配器 + 一个正文 + 一个按钮变体 + 一个开关）。集成必须证明
  **同一个插件实例、同一个「已引用记录」空间、同一条 insertQuote/notify 通道**在两个 Feature 的
  用户路径之间真正连通，而不是两条各自通过的路径。

## 3. 验收矩阵

行状态在运行记录中逐行判定（`PASS` / `FAIL` / `BLOCKED` / `RE-SCOPED`）。`阻断 PASS` 为「是」的
行全部为 `PASS` 才允许登记集成结果。

| ID | 用户触发 | 实际路径 | 期望的持久结果 | 证据物 | 阻断 PASS |
| --- | --- | --- | --- | --- | --- |
| I-01 | 同一会话内：先文本引用 `notes/a.md`，再对 `samples/page.html` 开启接管并引用，再对同一 HTML 二次引用，最后回到 `a.md` 二次引用 | 真实 `.md` 头部引用按钮（真实鼠标）→ 真实点击接管开关（不刷新页面）→ iframe 内真实拖选 → HTML 引用按钮（真实鼠标）→ 切回 `.md` tab | ①原文块 `来源：notes/a.md`；②原文块 `来源：samples/page.html`；③`page.html` 指针块（含路径、不含原文、不含 `来源：`）；④`a.md` 指针块（证明两 Feature 共用同一「已引用记录」空间）；全过程同一页面目标、插件实例未重载 | `evidence/I-01-*.png|json`、`evidence/integration-summary.json` 的 `cards` 序列 | 是 |
| I-02 | 依次打开 `.md`（接管关）、`.html`（接管关）、`.html`（接管开）、`.md`（接管开），读取头部控件 | 真实预览切换 + `data-side-quote-*` 标记读取 | `.md` 恒有文本引用按钮、无接管开关、无 HTML 引用按钮；`.html` 接管关时仅有开关（`aria-pressed=false`）且无文本引用按钮；接管开时开关为开、出现 HTML 引用按钮、仍无文本引用按钮。两格式控件互不串场 | `evidence/I-02-*.png|json` 控件快照 | 是 |
| I-03 | 保持接管持久开关为开，打开 `notes/b.md`、`samples/report.pdf`、`samples/image.png`、`notes/secret.md` | 真实文件预览切换 | 接管开关对非 HTML 格式零影响：`b.md` 文本引用按钮仍在且可用；`.pdf`/`.png` 无文本引用按钮、无接管开关、无 HTML 引用按钮；控制台无 error | `evidence/I-03-*.png|json` | 是 |
| I-04 | 通过 Settings 关闭脚本闸门（`ui-settings` developer tools）后：对 `.md` 划词引用；再打开 `.html`；随后把闸门恢复为开 | Settings UI 真实交互 → `.md` 引用 → `.html` 预览 → 闸门恢复 | 闸门为假时 `.md` 路径完全不受影响（按钮可用、插入成功、卡片出现）；`.html` 不接管、无 HTML 引用按钮、开关为开但禁用并给出可读原因；闸门恢复为真后无需刷新自动重新接管（开关可用、正文回到接管、HTML 引用按钮出现）；持久开关不被静默改写 | `evidence/I-04-*.png|json`、通知增量 | 是 |
| I-05 | 同一会话内：对超阈值文本（`notes/long.txt`）引用 → 对超阈值 HTML（`samples/long.html`）接管后引用 → 对 `notes/secret.md` 引用 → 对 `samples/page.html` 引用 | 父文档选区（文本）、iframe 内选区（HTML）、真实点击 | 两侧共用的内容契约在同一会话同时成立：来源路径均为工作区相对路径（无盘符、无前导 `/`）；截断为 200 行/8000 字符先到先截且两侧都追加同一截断说明、`summary` 标记为「已截断」；未超阈值不带说明；`summary` 元信息形状一致（`<path> N 行` / `已引用过`）；通知预算：成功插入 0 条、敏感名命中恰好 1 条 `info`、0 条 `error`；开关自检恰好 1 条 `info` | `evidence/I-05-*.png|json`、`cards` 与 `notices` 增量 | 是 |
| I-06 | 负向路径：无选区（`.md` 与 HTML 各一次）、跨 tab 旧选区、闸门关闭（I-04 已取）、插件停用（I-08 取） | 真实交互 | 无选区时两侧按钮均 `disabled`；`.md` 划词后切到 HTML tab 再切回，旧选区不得产生插入（按钮置灰或点击零插入）；不产生 error 级联 | `evidence/I-06-*.png|json` | 是 |
| I-07 | 接管生效时读取 iframe 安全面与桥报文 | 父页面读取 `sandbox` 属性；子 frame 隔离探测；父页面 message 记录；证据文件扫描 | `sandbox` 恰为 `allow-scripts`（绝不含 `allow-same-origin`）；frame 内不可达 `parent.document`、无宿主全局对象；每条桥报文 `origin === 'null'`、`source === frame.contentWindow`、`channel`/`version` 匹配、至少一条 `ready`；全部证据文件不含启动地址的 `?token=` | `evidence/I-07-*.json`、证据根 token 扫描结果 | 是 |
| I-08 | 接管开启且存在文本引用按钮时，在插件清单中停用插件 | 真实停用 → 观察残留 → 重新启用并整页刷新 | 两个 Feature 的控件同时消失（文本引用按钮、接管开关、HTML 引用按钮、接管正文）；控制台无 error；停用后再划词无卡片；记录「已打开的 HTML 预览正文空白直到刷新」为已知边界事实（不判缺陷）；重新启用后两 Feature 同时恢复，持久开关仍为开 | `evidence/I-08-*.png|json`、边界事实文件 | 是 |
| I-D01 | 复用与复跑（诊断，不单独决定 PASS） | 命令表 `lint` / `test` / `e2e` | 两条 `node --check` exit 0；单元层 `71 tests / 54 pass / 0 fail / 17 skip`（skip = 未提供浏览器驱动，记「未执行」）；提交版 e2e 在本实例串行复跑 `17/17`，原始日志保留；`.pdf/.xlsx/.docx` 的渲染等价沿用 Leaf 证据（`d4f6eab`，产品字节相同）并写明来源与适用条件 | `raw/*.log`、运行记录 §命令 | 否 |

## 4. 证据分级

- **本次运行证据（current-run）**：I-01…I-08 的全部截图、sidecar、`integration-summary.json`。
- **可复用历史证据（historical capability）**：F01/F02 Leaf 的验收与格式回归记录，仅用于「未被
  破坏的既有能力」对照；不替代任何跨 Feature 运行时行。
- **诊断证据**：I-D01 的命令输出与原始日志。

## 5. 明确不作为通过条件

- 已知边界不判缺陷：接管开启时停用插件，已打开的 HTML 预览正文空白直到刷新（`code/README.md`
  已知取舍第 10 条）；页面脚本与桥同 realm 可伪造上报且无令牌（已接受边界，**不写入「已验证安全」**）；
  `focusedTarget(iframe)` 属「实现能力 > 文档承诺」；手写 bundle 与 DSH `0.2.2-rc.3` 强耦合。
- 不做：相对资源读取、内容特征级敏感检测、跨预览体选区、全量「会话已读」、嵌套 iframe/画布/
  `user-select:none` 页面文字。
- 不复用 Leaf 的成功结果去替代跨 Feature 连续链路（I-01 必须是同一次页面会话内的连续序列）。
