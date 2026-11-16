# 引用实现契约

> 权威范围：本文件是引用能力的可执行实现契约——接入位点、归属校验、核心流程、适配器接缝、
> 生命周期清理、失败与边界行为。内容格式见[引用内容契约](sidebar-quote-contract.md)，
> 系统边界见[系统边界与模块划分](../../architecture/module-boundaries.md)。

## 1. 目的与范围

在右侧栏的文本类文档预览中，让用户通过头部「引用」按钮把当前选区组装成带来源路径的引用
块插入当前会话输入框，并对失败与敏感内容给出通知。

范围内：手写客户端 bundle 内的通用核心（选区捕获 → 来源归属 → 组装引用 → `insertQuote`
→ `notify`）、注册式格式适配器接缝与文本适配器、**HTML 预览的显式接管**（定义与正文注册、
不透明 origin iframe 桥、头部开关与引用按钮变体、与平台页面脚本闸门联动的生效状态机）、
事件与定时器的完整释放、中英文案。

范围外：相对资源读取与打包、会话历史的全量「已读」推断、内容特征级敏感检测、嵌套 iframe /
画布 / `user-select: none` 页面内文字（均见[产品目标](../../product/product-vision.md)的边界）。

## 2. 接入位点

全部接入只使用下列受支持位点；REJECT 项是实现禁令，不是建议。

| 用途 | 位点 | 说明 |
| --- | --- | --- |
| 按钮渲染 | `sidebar.right.tab.document.actions`（`list`，`scope: session`） | 位点业主携带 `absolutePath`；仅在文件 Host 路径已知时渲染。接管生效时额外注册 HTML 引用按钮变体；开关是另一个独立控件 |
| HTML 预览正文 | `sidebar.right.tab.document`（keyed，键为接管实现的 `id`） | 与 `ctx.documentPreviews.register` 的定义同生同灭 |
| 选区归属 | `ctx.sidebarRight.focusedTarget()` | 返回拥有当前焦点的侧栏页目标（含 `sessionId`、`paneId`、`tabId`、`occurrence`） |
| 当前会话 | `ctx.sidebarRight.mounted` | 屏幕上会话的快照；决定插入目标 |
| 会话作用域 | `ctx.sessions.scope(sessionId)` | 为空必须按失败路径处理 |
| 插入与通知 | `ctx.conversation.input.for(scope)` 的 `insertQuote` / `notify` | 唯一插入与通知通道 |
| 工作区根 | `ctx.sessions.binding(sessionId)?.session.projections.faceOf('workingDirectory')` | 用于把绝对路径相对化；可能为空 |
| 页面脚本闸门 | `ctx.configForms.developerTools.enabled`（快照 + 订阅） | 未到达时视为关闭（fail-closed） |
| 文案 | `ctx.locale.register(NS, { zh, en })` | 中英双语 |
| 定时器 | `ctx.timer` 的受管定时器 | 必须随插件停用释放 |

REJECT：用 `data-*`、CSS module 类名、DOM 层级或 React 内部结构判断「这是文本预览体」；
直接操作输入框 DOM 或编辑器实例（只允许 `insertQuote` / `notify`）；修改自带插件注册的
位点内容或在自带插件 id 下注册组件。

## 3. 归属校验

目标语义：

1. 选区所属的侧栏页目标必须与按钮自身的页目标是**同一个 tab 实例**；
2. 该目标的 `sessionId` 必须等于 `sidebarRight.mounted` 的当前会话，否则置灰；
3. 同一 tab 实例即同一文件、同一预览体；不一致则置灰。

实现取「两元素 + 身份比较」，不解码地址、不读 DOM 属性、不碰自带插件私有字段：按钮
所在 tab、选区锚点所在 tab、选区终点（`focusNode` / `range.endContainer`）所在 tab 三方
的 `sessionId` 与 `occurrence.id` 一致才可用。

**起点与终点都必须判定**：跨预览体的选区在浏览器里是一条合法选区，只判锚点会让 A 的
按钮读到跨越到 B 的文本、却按 A 的路径写 `来源：`，并绕过 B 的敏感名警示。终点侧解析
不到元素时按置灰处理，不得退化成只判锚点。

`focusedTarget` 可能抛错（未同步的新 tab），调用方必须捕获并置灰。

### 3.1 两条归属分支（接缝的声明式差异）

`readSelection` 返回的 `Capture` 可以携带 `witness`（本次读取来源的 iframe 元素）：

- **无 `witness`**（文本路径）：沿用上面的三元素校验（按钮、锚点、终点三方身份一致），
  行为逐字不变。
- **有 `witness`**（HTML 路径）：父文档没有选区，因此改用
  `ctx.sidebarRight.focusedTarget(witness)` 解析该 iframe 所属页目标，要求其 `sessionId`
  一致且 `occurrence.id` 等于按钮自身的 `occurrence.id`。

约束：

- 两条分支是接缝的**声明式差异**，核心不得出现按扩展名或格式的 `if`。
- `focusedTarget` 抛错、`witness` 解析不到、`capture` 抛错，一律按置灰处理，异常不得冒到
  渲染层。
- 归属通过后，插入内容一律使用同一次 `capture`，不得二次读取。

## 4. 核心流程

```text
[selectionchange / pointerup + keyup]
  → 防抖 350ms 定稿按钮状态（可用 / 置灰）
    → 判定：同一预览体内存在非空白选区？归属校验通过？白名单命中？
      → 是：按钮可用
      → 否：按钮置灰
[点击按钮]
  → 处理中标记（重复点击直接返回）
    → 以点击时刻重新读取选区文本（不用防抖缓存）
      → 空或空白：error 通知，结束
    → 解析来源路径：absolutePath → 工作区相对化
    → 查询已引用记录（sessionId + 相对路径）
      → 已存在：生成指针块
      → 不存在：读取摘录 → 截断 → 生成原文块
    → 敏感名单命中：发出一条 info 警示（不阻断插入）
    → insertQuote(text, summary)
      → false：error 通知，结束（不重试、不降级为 setDraft、不写记录）
      → true：写入已引用记录
  → 清除处理中标记
```

要点：

- 防抖只决定**按钮状态**；点击永远以点击时刻的选区为准，因此防抖窗口内点击与防抖后点击
  结果一致。
- 已引用记录只在 `insertQuote` 返回 `true` 后写入。
- 一次点击最多产生一条通知（失败 → 一条 `error`；敏感命中且插入成功 → 一条 `info`）。

## 5. 适配器接缝

```js
/**
 * 形状契约（手写 JS，无类型标注；此处仅示意）
 * {
 *   id: string,                       // 唯一实现名
 *   match(path: string): boolean,     // 决定本适配器是否接管该路径
 *   readSelection(target): Capture | null
 * }
 * target  = { path, document, anchor, tab: { sessionId, occurrenceId } | null }
 * Capture = { text: string, path: string, witness?: Element }
 */
```

- 核心只依赖 `id`、`match`、`readSelection` 三个成员；不得出现按扩展名或按格式的 `if` 分支。
- 适配器注册与注销必须幂等；重复 `id` 必须抛错，不得静默覆盖。
- 自带文本适配器只处理「父页面 DOM 可读选区」的文本类格式，其 `match` 委托给格式白名单。
- HTML 适配器不自带 `match` 白名单：它只认 `.html` / `.htm` 的接管路径，从桥缓存里挑选属于
  按钮自身 `occurrence` 的 iframe；无法消歧时返回 `null`（置灰），不猜。
- `readSelection` 返回 `null` 表示「本适配器此刻无法提供选区」，核心据此置灰，不得回退去猜。
- 新增可引用格式只允许新增一个适配器，不修改本节之外的核心代码；该可证性由单元测试以
  假适配器断言。
- `target.tab.occurrenceId` 缺失时不臆造：适配器按「无法归属」返回 `null`。

## 6. 生命周期与清理

插件必须在 `ctx.effect(...)`（或等效受管注册）中登记每一项，保证停用时全部释放：

| 资源 | 释放要求 |
| --- | --- |
| `selectionchange` 监听 | 移除监听 |
| `pointerup` / `keyup` 监听 | 移除监听 |
| 350ms 防抖定时器 | 释放；停用后不得再触发一次状态定稿 |
| 适配器注册 | 注销回调；注销后核心不得再调用其 `match` / `readSelection` |
| 会话作用域订阅 | 取消订阅 |
| 本地化字典 | 注销 |
| 位点注册（按钮组件） | 注销 |
| 已引用记录 | 插件内存状态，随停用清空；不得持久化 |
| `documentPreviews` 定义 | `ctx.effect` 注销回调 |
| HTML 正文位点、开关位点、引用按钮位点 | 各自注销；注销后核心不得再渲染 |
| 闸门快照订阅 | 取消订阅 |
| `window` 的 `message` 监听 | `removeEventListener` |
| 每个 iframe 的桥状态 | 正文卸载即删除条目；全部清理时必须连监听一起移除 |
| `blob:` URL | 正文卸载时 `revokeObjectURL` |
| 开启自检与降级通知的去重表 | 插件内存，随停用清空 |

「处理中 / 正在切换」标记必须在 `finally` 语义下清除；任何异常路径都不得让开关卡在禁用态
或让注册处于半完成状态。接管组的开启是**原子**的：任一步注册失败即按逆序回滚已完成的
注册，并让接管保持关闭，不留下半注册状态。

「处理中」标记必须在 `finally` 语义下清除；任何异常路径都不得让按钮永久卡在禁用态。
单个适配器抛错必须被核心捕获并转为一次 `error` 通知，不得让异常冒到宿主渲染层。

## 7. 失败与边界行为

| 场景 | 行为 |
| --- | --- |
| 无屏幕会话（`mounted` 为空） | 按钮置灰；竞态点击不插入且静默（无可用通知通道） |
| `sessions.scope()` 为空 | 按钮置灰；竞态点击静默且不插入 |
| 选区为空或仅空白 | 按钮置灰；竞态下点击发一条 `error` |
| 选区跨越两个预览体 | 按钮置灰（不支持） |
| 归属校验不通过 | 按钮置灰 |
| 路径无法相对化（工作区外 / 根未知） | 保留原样路径继续插入，不额外提示 |
| 敏感文件名命中且插入成功 | 一条 `info` 警示 |
| `insertQuote` 返回 `false` | `error` 通知，不重试、不降级、不写记录 |
| 适配器 `readSelection` 抛错 | `error` 通知，按钮恢复可用 |
| 预览在点击前被关闭 / tab 切换 | 归属校验失败 → `error` 通知 |
| 同一文件第二次及以后 | 插入指针块 |
| 插入成功 | 插件自身不移动焦点、不滚动、不清选区 |
| 接管关闭 | 不注册任何接管项；HTML 预览完全由自带实现渲染，正文与插件停用阶段逐字节一致（同一实例、同一闸门状态、同一裁剪区域） |
| 闸门为假或未到达 | 不接管；开关可用但当持久开关为开时呈禁用并写明原因，不弹通知（除非用户点击开启） |
| 开启成功 | 一条 `info` 自检通知；正文切为接管实现 |
| 开启但注册失败 | 一条 `error` 说明原因；不注册 |
| 页面 UTF-8 解码失败 | 正文给出失败行；无桥、无摘录；不额外通知 |
| 桥 4000ms 未就绪或收到 `error` | HTML 引用按钮恒置灰；同一页目标最多一条 `info` |
| 无选区 / 选区仅空白 | 引用按钮置灰；点击竞态下发一条 `error` |
| 手动切回自带渲染器 | HTML 引用按钮仍存在但恒置灰（该位点拿不到本 tab 选中的实现） |
| 接管开启状态下停用插件 | 全部注册注销、iframe 卸载、blob 回收、监听移除；此后划词无反应。已打开的预览正文为空，**整页刷新后**由自带实现渲染（平台侧行为，见 `code/README.md` 已知取舍） |

通知去重口径（按实现统一）：状态类通知按**页目标**去重，同一页目标不重复；该预算不占用
点击路径的「一次操作最多一条通知」。开启自检在成功与失败两个分支各恰好一条。

### 7.1 通知通道的真实边界

`notify` 是**会话绑定**通道（`conversation.input.for(scope).notify`）。因此当「没有屏幕
会话」或「会话作用域为空」时，本插件没有可投递的通知位点，这两种状态下的竞态点击表现为
静默且不插入。为减少静默面，按钮状态计算本身要求会话作用域可用，使这两种状态正常表现为
置灰；其余失败分支都各发一条 `error`。

### 7.2 插入侧副作用的边界

`insertQuote` 在 `text.trim() === ''`、facade 已释放、编辑器处于发送/裁决/提交中，或引用
插入被关闭时返回 `false`；成功时平台内部会执行 `focus()`。因此「插入后不抢焦点」的可
实现含义是：**插件不主动移动焦点、不滚动、不清选区**；焦点回到输入框属于插入通道的固有
行为，已作为已知取舍记录。

按钮必须在 **`mousedown`** 上 `preventDefault()`，以免浏览器在按下时折叠预览选区（否则
点击时读到空选区）。不采用 `pointerdown`：其 `preventDefault()` 会抑制兼容鼠标事件，
存在吞掉后续 `click` 的风险。

## 8. 运行形态与单文件理由

- 客户端 bundle 为手写已构建形态，React 经 `require()` 从平台模块表解析；全部运行时代码
  内联在 `code/client.js`，纯逻辑通过 `factory()` 返回的 `internals` 面暴露给 `node:test`
  （零构建下唯一可测途径）。
- 客户端 bundle 由同源 classic `<script>` 单入口载入，包内多文件只能走 `require.async`
  chunk 机制，属新的加载时序与热更新风险面；因此保持单文件，不按行数硬拆。

## 9. HTML 接管：注册形状与生效状态机

注册形状（定义与正文必须同生同灭）：

```js
// 定义
ctx.documentPreviews.register({
  id: HTML_BODY_ID,                 // 同时作为正文 keyed 位点的 key
  extensions: ['html', 'htm'],
  priority: 'extension',            // 外部实现排在自带 builtin 之前
  title: () => t('html.viewerTitle'),
  loading: 'bytes-complete',        // 正文收到 { kind: 'bytes', data }
  wrap: false,
})

// 正文：keyed 位点，key 为上面的 id
ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
  { name: 'sidebar.right.tab.document', key: HTML_BODY_ID, locale: NS }, HtmlTakeoverBody,
))
```

生效状态机：

```text
persistedOn  = localStorage['dsh-side-quote:html-takeover'] === 'on'   // 缺失/非法/不可读 → false
gateOpen     = ctx.configForms.developerTools.enabled.getSnapshot()    // 未到达 → false
effective    = persistedOn && gateOpen
```

| persistedOn | gateOpen | 界面 | 注册状态 |
| --- | --- | --- | --- |
| false | 任意 | 开关为关；开关可用（闸门为假时仍可点，但只写入偏好） | 不注册任何接管项 |
| true | true | 开关为开 | 定义 + 正文 + 引用按钮全部注册 |
| true | false | 开关为开但呈「暂不可用」，禁用并说明原因 | 不注册任何接管项 |

规则：

- `effective` 每次跳变只做一次注册或注销；同一状态不得重复注册（平台侧重复 `id` 会抛错，
  幂等由插件自己保证）。
- 闸门快照必须订阅：值从假变真时自动重新接管，变假时立即回落到自带实现，**不得**把
  `persistedOn` 静默改成关。
- 读取 `localStorage` 抛错、值非法或键不存在一律视为关闭；写入失败不得抛错，也不阻止开关
  的视觉状态更新。
- 开启动作触发一次自检并给出**一条**结果通知（成功 `info`，失败按原因 `error`）；自检失败
  不阻止注册状态，但界面必须能表达失败原因。

## 10. HTML 接管：iframe 桥

### 10.1 载体

- 正文用 `URL.createObjectURL(new Blob([bootstrap], { type: 'text/html' }))` 承载 iframe，
  卸载时 `revokeObjectURL`。**不用 `srcDoc`**：`srcdoc` 的 base URL 继承父文档，会把页面里
  的相对引用解析到服务端口。
- iframe 属性固定：`sandbox="allow-scripts"`，**不得**出现 `allow-same-origin`、
  `allow-forms`、`allow-popups`、`allow-top-navigation`、`allow-modals`。
- 页面字节按 UTF-8 严格解码；解码失败按「渲染失败」处理（正文给出失败行，不建立桥，
  不产生摘录）。

### 10.2 引导脚本（预写注入）

引导脚本是与自带预览同构的外层文档，依次完成：保存 `Document.prototype.getSelection` 的
快照引用（防页面覆盖）→ 在 `window` 上以捕获方式安装 `selectionchange` / `mouseup` / `keyup`
监听（`window` 级监听在 `document.open()` 之后仍然有效）→ 立即向父页面发一条 `ready` →
事件触发时读取选区并在非空白时上报 `selection` → 最后 `document.open(); document.write(page);
document.close();`。

约束：

- **不向页面注入 `<script>`**：桥的可用性不得取决于页面 `meta` CSP 的 `script-src`。
- 页面 HTML 以 JSON 编码嵌入外层脚本，并对 `</` 与 `<!--` 做转义；不得用字符串拼接直接插入
  页面内容。
- 桥脚本自身异常必须被捕获并上报 `error`，不得让异常逃逸到 iframe 全局。

### 10.3 协议与父侧校验

```text
channel : 'dsh-side-quote/html-bridge'   // 固定字面量
version : 1
kind    : 'ready' | 'selection' | 'error'
text    : string（仅 kind === 'selection'，上限 65536 字符）
```

父侧接收规则（全部满足才接受，否则静默丢弃，绝不抛错）：

1. `event.source === iframe.contentWindow`（按引用全等，不用名字或 origin 猜测）。
2. `event.origin === 'null'`（不透明 origin）。
3. `channel` 与 `version` 完全匹配，`kind` 合法。
4. `kind === 'selection'` 时 `text` 必须是字符串且长度不超过上限。

丢弃无效报文不得清除已有的可用文本（无效报文是噪声，不是「清空选区」）。

### 10.4 父侧状态与新鲜度

```text
bridge[iframe] = { ready, text, failed, unmounted }
```

- 状态以 iframe 元素为键，只在该正文实例内存在；**不用路径作键**（同一文件可能在两个
  窗格各开一次）。
- 每条 `selection` 覆盖前值，只保留最新；不排队、不累积历史。
- 就绪超时 4000ms；超时之后到达的 `ready` 可以把状态恢复为可用，不需要重新挂载 iframe。
- 每条有效报文都会触发头部按钮状态重算：父文档收不到 iframe 内的选区事件，这是唯一的
  变化信号。
- 点击父页面按钮不改变 iframe 内的选区，因此读取值与点击时刻一致；页面脚本在点击前清空
  选区而桥尚未上报属可接受的极小竞态。

### 10.5 信任边界

页面脚本与桥同 realm，**必然可以伪造上报**；消息令牌不可防。边界是：桥只上报文本，页面
拿不到引用按钮、`insertQuote`、会话作用域或任何宿主对象；插入仍需用户在父页面点击。
该结论不得表述为「已验证安全」。

## 11. HTML 接管：头部控件与降级

| 控件 | 出现条件 | 行为 |
| --- | --- | --- |
| 接管开关 | 路径为 `.html` / `.htm`（不看别处） | 点击翻转持久偏好并即时生效；闸门为假时禁用并说明原因（`title` + `aria-describedby` 双通道，视觉隐藏说明） |
| HTML 引用按钮 | 仅 `effective === true` 时注册 | 与文本按钮同形：可用性由桥缓存与归属校验决定；点击走同一条插入 / 通知路径 |

- 两个控件都必须带稳定标记供验收断言（开关、引用按钮、正文容器、iframe 各自一个）。
- 引用按钮沿用 `mousedown` 的 `preventDefault()` 处理，保住父页面选区语义，不采用
  `pointerdown`。
- 开关的 `aria-pressed` 反映持久偏好；禁用态必须给出可读原因，不得只置灰。
- 两个控件的显示条件都**不得**依赖格式白名单常量。
- 能力差距在三处一致呈现：开关说明（「得到：可划词引用」「失去：外部 CSS/JS/图片不加载」）、
  首次开启的通知、`code/README.md` 的已知取舍。UI 不新增常驻提示条或面板。
- 桥失败通知的落点：正文组件没有会话作用域，因此由桥在超时或 `error` 时回调失败上报，
  实现侧用 `focusedTarget(frame)` 求页目标，再经屏幕会话 + 作用域 + 输入框投递；解析不到
  时以 frame 身份为键去重；无作用域时静默（与第 7 节的通道边界一致）。

## 12. 跨域依赖

- 无跨 owner 依赖：本项目 owner 表只有 `core`。
- 外部依赖面只读：`slots`、`sidebarRight`、`sessions`、`conversation`、`locale`、`timer`、
  `documentPreviews`、`configForms`。版本升级后必须回归，责任在本项目。

## 13. 测试与验证期望

命令只取自 Workflow Profile 的命令表：静态检查（两条 `node --check`）、单元/集成测试、
端到端测试。端到端环境、用例与证据形式见[测试与验收](../../testing/sidebar-quote-acceptance.md)。
