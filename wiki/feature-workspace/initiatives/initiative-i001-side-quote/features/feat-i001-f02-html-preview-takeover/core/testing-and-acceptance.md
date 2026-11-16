# I001-F02 测试与验收

> 范围：本 Feature 的必测用例、验收标准、端到端环境与证据形式、派生变更义务。
> 实现契约见 [implementation.md](implementation.md)，内容契约见
> [quote-content-contract.md](quote-content-contract.md)。
> F01 的 U-01…U-19、E-01…E-09、AC-1…AC-16 仍然有效，本文件只新增用例，不改写其结论。

## 1. 分层与责任

| 层 | 承载 | 运行方式 | 能证明什么 |
| --- | --- | --- | --- |
| 单元层 | 接缝扩展、桥协议校验、桥状态与超时、闸门状态机、持久化 fail-closed、清理、白名单不变、结构断言、字典键 | `node --test "code/test/**/*.test.mjs"` | 纯逻辑与状态逻辑；无需浏览器与 DSH |
| 端到端层 | 真实实例里的开关、接管渲染、真实拖选、插入、通知、回退与清理 | `node --test "code/test/e2e/**/*.test.mjs"`（需外部实例与浏览器驱动） | 浏览器主链路 |
| 人工回归层 | 同一 `.html` 在自带与接管下的可读性、可选择性、外部资源未加载表现 | 人眼逐项 + 截图 | 接管后的预览是否真的可用 |
| 隔离判定 | 证据 sidecar 的 profile / 端口 / revision | 由端到端层自动写入 | 未触碰 live 环境 |

**任何"已验证"结论都不得只引用 `node --check` / `node --test`**；浏览器行为必须有端到端证据。

## 2. 单元层必测用例

编号延续 F01（U-01…U-19 已存在），本 Feature 从 `U-20` 开始。

### U-20 白名单不变（护栏）

- 断言 `ALLOWED_SUFFIXES` 不含 `html` / `htm`（大小写均不含），`ALLOWED_FILENAMES` 仍为 `['.env']`。
- 断言 `isAllowedPath('x.html') === false`、`isAllowedPath('x.htm') === false`、
  `isAllowedPath('page.HTML') === false`。
- 归属：AC-23；与 AC-7（F01）共同成立，二者不重复定义白名单。

### U-21 接缝的两条归属分支

- 文本分支（无 `witness`）：沿用 F01 三元素校验——锚点与终点同属按钮所在 `occurrence`
  时可用；跨预览体时置灰且强制点击只产生一条 `error`、零插入（F01 U-19 原样通过）。
- HTML 分支（有 `witness`）：`witness` 的 `occurrence.id` 等于按钮 `occurrence.id` 时可用；
  不等时置灰，强制点击产生一条 `error` 且不插入、不写已引用记录。
- `focusedTarget(witness)` 抛错或返回空 → 置灰，异常不外泄。
- 归属：AC-22。

### U-22 `target` 形状

- `readSelection(target)` 收到的 `target` 含 `path`、`document`、`anchor`，以及
  `tab: { sessionId, occurrenceId }`；`tab.sessionId` 等于当前屏幕会话。
- 无屏幕会话或无 `occurrence` 时 `tab.occurrenceId` 为 `undefined`，适配器返回的
  `witness` 分支按 U-21 置灰，不得放行。
- 归属：AC-22。

### U-23 报文校验

- 接受：`channel` / `version` / `kind` / `text` 全合法的 `selection`；`ready`；`error`。
- 丢弃且不抛错：`channel` 不符、`version` 不符、`kind` 非法、`text` 非字符串、
  `text` 超过 65536 字符、`event.source` 不是该 iframe 的 `contentWindow`、
  `event.origin` 不是 `'null'`、`data` 为 `null`/数字/数组。
- 丢弃不得清除已有的可用文本（无效报文是噪声，不是"清空选区"）。
- 归属：AC-24。

### U-24 桥状态按 iframe 隔离

- 两个 iframe 各自上报，互不串文本；`readSelection` 只返回 witness 对应 iframe 的文本。
- 同一路径在两个窗格各开一次时，两个 iframe 的文本互不影响。
- iframe 卸载后其条目被删除；全部卸载后桥缓存为空。
- 归属：AC-24、AC-27。

### U-25 就绪超时与恢复

- 挂载后 4000ms 内未收到 `ready` → 该 iframe 标记不可用（按钮置灰）。
- 超时之后到达的 `ready` 恢复可用；恢复不需要重新挂载 iframe。
- 收到 `error` 后到达的 `ready` 同样可以恢复。
- 归属：AC-25。

### U-26 闸门状态机

- `persistedOn=true` + `gateOpen=false` → 不注册：`documentPreviews` 定义计数 0、正文位点 0、
  引用按钮位点 0、`window` message 监听 0。
- `gateOpen` 变 true → 三项各注册一次，且重复通知不重复注册。
- `gateOpen` 再变 false → 三项全部注销、监听移除、桥缓存清空，且 `persistedOn` 仍为 true。
- 归属：AC-25、AC-27。

### U-27 持久化 fail-closed

- 键缺失、值为 `''`/`'off'`/`'ON '`/`'1'` → 视为关闭。
- `localStorage.getItem` 抛错（模拟隐私模式）→ 视为关闭，且 `apply` 不抛错。
- `setItem` 抛错 → 开关视觉状态仍更新，下一次读取仍按关闭处理；不得抛错到渲染层。
- 归属：AC-18。

### U-28 开启/关闭/卸载的计数

- 装 → 开 → 关 → 卸：`documentPreviews` 定义、正文位点、开关位点、引用按钮位点、
  `window` message 监听、桥缓存、blob URL（以注入的 `createObjectURL`/`revokeObjectURL`
  计数断言）全部归零。
- 装 → 开 → 卸（不先关）：同样全部归零，且不发多余通知。
- 归属：AC-27。

### U-29 通知预算

- 开启自检：成功路径恰好一条 `info`；闸门不可用路径恰好一条 `error`；桥未就绪路径恰好
  一条 `info` 且同一页目标不重复。
- 点击路径的通知计数沿用 F01 U-14：各失败分支各一条 `error`，状态通知不叠加。
- 归属：AC-26。

### U-30 "只加不减"结构断言

- 新增项恰好为：一个适配器（`id` 唯一）、一个正文位点（key 为接管实现的 `id`）、
  一个引用按钮位点（id 唯一）、一个开关位点（id 唯一）。
- 未变项：文本适配器 `id`、`match`、`readSelection` 签名与行为；文本引用按钮的渲染条件；
  `ALLOWED_SUFFIXES` / `ALLOWED_FILENAMES`；内容模板与截断常量。
- 文本适配器对 `.html` 的 `match` 仍为 `false`（接管开启与关闭两种状态下都断言）。
- 归属：AC-23。

### U-31 字典键

- `zh` 与 `en` 新增键集合完全一致，无缺失、无多余（沿用 F01 U-17 的断言方式）。
- 新增的内容文案（如接管实现的显示名以外的内容标识）不得混进字典；`来源：`、截断说明、
  指针文案仍不在字典中。
- 归属：AC-30。

## 3. 端到端必测用例

编号延续 F01（E-01…E-09 已存在），本 Feature 从 `E-10` 开始。全部在独立 profile 与
独立端口运行。

- **E-10 关闭态正文等价**：清空接管键 → 打开 `samples/page.html` → 断言头部有接管开关且
  为关、无引用按钮 → 对 `sidebar.right.tab.document` 区域截图 → 与「插件停用」实例的
  同区域截图逐字节对比 → 断言正文是自带实现（自带 `data-html-preview` iframe 存在、
  `sandbox` 属性与自带一致，`data-side-quote-html` 不存在）→ 控制台无 error。
- **E-11 开启自检**：点击接管开关 → 恰好一条 `info` 通知 → 正文出现 `data-side-quote-html`
  与 `data-side-quote-html-frame` → 自带 `data-html-preview` 消失 → 头部出现 HTML 引用按钮
  且置灰（无选区）→ 控制台无 error。
- **E-12 真实拖选引用闭环**：在 iframe 区域内真实拖选一段可见文字（见 §4.2）→ 350ms 后
  引用按钮可用 → 真实鼠标点击 → 输入框出现「摘录 + 空行 + `来源：samples/page.html`」，
  去掉行首 `> ` 后与所选文本逐字比对。证据必须记录选区驱动方式。
- **E-13 同文件再引**：同一会话内对同一文件再选另一段 → 点击 → 出现指针块，只含路径，
  不含原文，不含 `来源：`。
- **E-14 无选区**：接管开启、页面已就绪、不划词 → 引用按钮存在且 `disabled`。
- **E-15 CSP 页面仍可引用**：打开 `samples/page-csp.html`（自带 `script-src 'none'` 的
  `meta` CSP）→ 接管开启 → 拖选 → 按钮可用 → 点击插入成功。该用例失败即为产品失败，
  不接受"降级通过"。
- **E-16 闸门关闭**：在实例里把 `ui-settings.developerTools.enabled` 置为 false → 点击
  接管开关 → 恰好一条 `error` 说明原因 → 正文保持自带实现 → 开关呈禁用且写明原因 →
  无接管定义注册（`data-side-quote-html` 不存在）。
- **E-17 开启后关闭**：接管开启状态下再点开关 → 正文回到自带实现、引用按钮消失、
  开关为关、控制台无 error、后续划词无反应。
- **E-18 开启状态下停用插件**：接管开启 → 在插件管理中停用 → iframe 消失、开关与引用
  按钮消失、再划词无反应、控制台无 error、无残留 `blob:` URL 被继续引用。

## 4. 端到端环境与证据形式

### 4.1 环境（沿用 F01，不降低要求）

| 项 | 值 |
| --- | --- |
| DSH profile | `side-quote-verify`（独立，由自带 web 模板新建） |
| 端口 | `34181`（**不得**使用用户 live 的 `3081`） |
| DSH_HOME | 临时目录（`%TEMP%\side-quote-f02\e2e\dsh-home`），不使用真实 `%USERPROFILE%\.dsh` |
| 浏览器 | 外部驱动的 Edge/Chromium，独立 `--user-data-dir` 与 CDP 端口 |
| 视口 | `1440x900`，`deviceScaleFactor: 1` |
| Node / OS | 与 F01 相同基线（Node 24、Windows 10.0.26200） |

端口 3181 的保留区间例外（F01 实测 3119–3218 不可绑定）继续适用：契约默认值保持不变，
实际运行由验收 session 显式传入 `34181` 并在证据中写明替换原因。

硬要求：全程不终止、不重启、不修改用户正在使用的 `dsh web` 进程与其 profile；实验代码
只进入 `side-quote-verify`；验收结束后按记录回收。

### 4.2 子 frame 选区的驱动方式

iframe 是不透明 origin，父页面无法用脚本操作其选区。端到端层必须按下列优先级取证：

1. **真实鼠标拖选（首选）**：用 CDP `Input.dispatchMouseEvent` 在 iframe 的可视区域做
   `mousePressed → mouseMoved（若干步）→ mouseReleased`。浏览器按坐标命中 iframe，无需
   同源，最接近真实用户操作。
2. **子 frame 执行脚本（备选）**：`Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart:
   false, flatten: true })` 后在该 frame 的 session 里 `Runtime.evaluate` 构造 `Range` 并
   `Selection`。使用备选方式时，证据里必须写明"选区由脚本合成，非物理拖选"。

不得把 2 的结果记为 1 的结果；F01 的同一取舍继续有效。

### 4.3 夹具

在实例工作区内放置（全部合成内容，无真实机密，验收后删除）：

| 夹具 | 用途 |
| --- | --- |
| `samples/page.html` | E-10、E-11、E-12、E-13、E-17、E-18 的主夹具（含标题、段落、列表） |
| `samples/page-csp.html` | E-15：`<meta http-equiv="Content-Security-Policy" content="script-src 'none'">` |
| `samples/page-assets.html` | 人工回归：外部 `extra.css`、`extra.js`、`extra.png` 引用，确认接管下不加载且不影响文字可选 |
| `samples/extra.css`、`samples/extra.js`、`samples/extra.png` | 上述页面的相对资源 |

规则：夹具一律在测试运行时生成到实例工作区临时目录；仓库内不得出现名为 `.env` 的文件
（沿用 F01 的仓库硬性禁止）。

### 4.4 证据形式

- 截图与断言输出写入本 Feature 证据目录
  `wiki/feature-workspace/initiatives/initiative-i001-side-quote/features/feat-i001-f02-html-preview-takeover/evidence/`，
  文件名带用例编号与序号；每张截图配同名 `.json` sidecar。
- sidecar 必须能对应：Git revision、实例 origin 与端口、profile、视口、用例编号、
  **接管状态**、**选区驱动方式**（`mouse` / `synthetic-range`）、**观察到的 iframe
  sandbox 属性**。
- 启动地址里的 `?token=…` 不得进入证据（sidecar 只记录 origin + path + port）。
- 正文区域对比截图必须裁剪到同一区域（`sidebar.right.tab.document`）后再算摘要。

## 5. 人工回归层

在同一个 `side-quote-verify` 实例、固定视口下逐项完成并留档：

1. 同一 `samples/page.html`：自带渲染 vs 接管渲染各截一次图，目视确认标题、段落、列表
   可读、可选中。
2. `samples/page-assets.html`：接管下确认外部 CSS/JS/图片未加载，文字仍可读可选中，且
   页面加载期间没有向 DSH 端口发起相对资源请求（用 CDP 网络面板或 `performance` 条目佐证）。
3. `samples/page-csp.html`：接管下确认页面按页面自身的 CSP 渲染（页面脚本被其自身策略
   阻止属预期），桥仍可用。
4. 结论必须逐项写「通过 / 失败 / 不适用」，不得只写"已验证"。

## 6. 验收标准

`acceptance.passed` 只有在下列全部为"通过"时才能置 `true`。

| ID | 判定条件 | 依据 |
| --- | --- | --- |
| AC-17 | 关闭态正文与未安装插件逐像素一致（裁剪到正文区域），且正文确为自带实现 | E-10 |
| AC-18 | 默认关闭；持久化缺失/非法/不可写一律 fail-closed 且不抛错 | U-27、E-10 |
| AC-19 | 开启闭环：自检一条通知 → 正文接管 → 真实拖选 → 按钮可用 → 点击插入原文块 | E-11、E-12、U-29 |
| AC-20 | 同一会话同一路径第二次为指针块，不含原文与 `来源：` | E-13 |
| AC-21 | 来源路径为工作区相对路径（工作区外保留原样） | E-12、F01 U-09 复用 |
| AC-22 | 归属判定两条分支都成立：无 witness 走三元素校验、有 witness 走 occurrence 相等；失败各一条 error 且不插入 | U-21、U-22 |
| AC-23 | 白名单常量与文本引用路径不变，新增项恰好为一个适配器 + 一个正文 + 一个引用按钮 + 一个开关 | U-20、U-30 |
| AC-24 | 桥报文校验按白名单执行，非法/超长/来源不符一律静默丢弃且不清空可用文本；状态按 iframe 隔离 | U-23、U-24 |
| AC-25 | 闸门状态机正确：闸门假/未知不接管，变真自动接管，变假回落；CSP 页面仍可引用；桥未就绪可判定 | U-25、U-26、E-15、E-16 |
| AC-26 | 通知预算：开启自检各分支恰好一条，状态通知按原因去重，不占用点击路径预算 | U-29、E-11 |
| AC-27 | 清理与可逆：开→关、开→卸、装→卸后所有注册、监听、缓存、blob 归零；关闭后正文回到自带 | U-24、U-26、U-28、E-17、E-18 |
| AC-28 | 未触碰 live：sidecar 显示 profile 为 `side-quote-verify`、端口非 `3081`，3081 进程未重启未终止 | 证据记录 |
| AC-29 | 内容契约沿用：模板、截断、指针、敏感名、summary 与 F01 一致；HTML 摘录为渲染文本 | E-12、E-13、F01 U-01…U-11 复用 |
| AC-30 | 中英字典新增键齐全且一致，内容文案不在字典中 | U-31 |

F01 的 AC-1…AC-16 继续有效，其中 AC-7 的 `.html` 断言按 [C-13] 改写为"关闭时无引用
按钮、有接管开关"，其余不变。

## 7. 由本 Feature 派生的变更义务

必须在实现阶段同批完成：

1. `code/README.md`：写入 §8 的已知取舍条目。
2. `wiki/code-ai/project-facts.md` §5「测试分层」：补一行 HTML 接管层（单元 + 端到端 +
   人工回归）与子 frame 驱动方式的说明；若实现期新增端到端环境变量，同批补入 §4。
3. `code/test/e2e/formats.test.mjs`（E-04 所在文件）：把 `.html` 的断言改为"无引用按钮、
   有接管开关"，并保留"其余格式两阶段截图一致"的既有断言。
4. `.factory/factory.yaml`：**不需要**新增命令（e2e 命令已登记）；若实现期确实需要新
   命令，必须先改配置并 `factory upgrade` 同批提交，不得只在文档里写。

## 8. 必须写入 `code/README.md` 的已知取舍

1. 接管默认关闭，入口是 HTML 预览头部的开关；关闭时正文与自带一致，但头部多一个控件。
2. 接管开启后外部 CSS / JS / 图片一律不加载；inline 样式与 inline 脚本照常生效。
3. 页面脚本与桥同 realm，可以伪造选区上报；令牌无法防范。页面拿不到任何宿主能力，
   插入仍需用户点击。
4. 手动在"打开方式"里切回自带渲染器时，HTML 引用按钮仍存在但恒置灰。
5. 接管要求开发者工具（页面脚本闸门）开启；关闭时开关不可用并说明原因。
6. 嵌套 iframe、画布渲染的文字、`user-select: none` 的页面内文字不可引用。
7. HTML 摘录是渲染文本，不保留源码缩进与行内多余空白。
8. 缩放不适用：HTML 预览本身没有缩放能力（image/pdf 才有）。
9. 手写 bundle 与本版 DSH 客户端接口强耦合：升级到新 rc 后必须重跑单元层与端到端层。

## 9. 未执行即不得声称通过

- 端到端因缺少外部驱动或证据目录而 `skip` → 记"未执行"，AC-17/AC-19/AC-20/AC-25/AC-27/
  AC-28 不得判通过。
- 人工回归未逐项留档 → AC-17 与内容可读性结论不得判通过。
- 只跑 `node --check` / `node --test` → 不足以支撑本 Feature 任何浏览器行为结论。
- E-12 若实际用脚本合成选区，必须在本行证据里标明；标为物理拖选即视为证据造假。
