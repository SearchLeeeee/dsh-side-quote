# I001-F02 核心域实现文档

> 范围：`core` 域的可执行实现契约——HTML 预览的接管注册、iframe 桥、生效闸门、适配器
> 接缝扩展、生命周期与降级。内容形态见 [quote-content-contract.md](quote-content-contract.md)；
> 测试与验收见 [testing-and-acceptance.md](testing-and-acceptance.md)。
> 状态：讨论已确认，待实现。本文件只在 F01 之上增加接管能力，不重述 F01 的核心流程。

## 1. 目的与范围

让用户在右侧栏的 `.html` / `.htm` 预览里划词并引用，且**默认关闭**：未显式开启时
HTML 预览仍由自带实现渲染。

范围内：

- 经官方扩展点注册/注销一个 HTML 预览实现（`ctx.documentPreviews` 定义 + keyed
  `sidebar.right.tab.document` 正文）。
- 不透明 origin iframe 内的桥（选区上报）、父侧缓存与校验。
- 预览头部的接管开关（`sidebar.right.tab.document.actions`）与 HTML 引用按钮变体。
- 与平台脚本闸门（`ui-settings.developerTools.enabled`）联动的生效状态机。
- F01 适配器接缝的最小扩展（`target.tab` / `Capture.witness`）及其在 `createQuoteActions`
  内的判定。
- 全部注册项的释放与桥缓存清理。

范围外（不得在本 Feature 内实现）：

- 相对资源（外部 CSS/JS/图片）读取与打包；内容特征级敏感检测；跨预览体选区；
  全量「会话已读」判定；嵌套 iframe / 画布 / `user-select: none` 页面内文字。
- 任何对自带插件包的修改、替换或卸载。

## 2. 运行形态与约束

- 客户端 bundle 仍是手写已构建形态（`window.__ModuleLoader__.load({ id, factory(require) })`），
  纯 JS、无 JSX、无 TypeScript，React 经 `require()` 从平台模块表解析。
- `package.json` 的 `dependencies` 保持为空；`files` 仍不含 `test/`；不引入新依赖。
- 宿主半（`index.js`）保持无副作用：不注册工具、不读取配置、不写文件。开关持久化只在
  浏览器侧完成。
- 不修改、不替换、不卸载任何自带插件包；不读取自带 HTML 预览 iframe 的内容。
- 本 Feature 新增的客户端服务依赖：`documentPreviews`（定义注册）、`configForms`
  （脚本闸门快照）。`slots` / `locale` / `timer` / `sessions` / `conversation` /
  `sidebarRight` 沿用 F01。

## 3. 接管注册形状

```js
// 定义（与正文必须同生同灭）
const HTML_BODY_ID = 'dsh-side-quote/html'
ctx.documentPreviews.register({
  id: HTML_BODY_ID,                 // 同时是 sidebar.right.tab.document 的 key
  extensions: ['html', 'htm'],
  priority: 'extension',            // 外部实现排在自带 builtin 之前
  title: () => t('html.viewerTitle'),
  loading: 'bytes-complete',        // 正文收到 { kind: 'bytes', data }
  wrap: false,
})

// 正文
ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
  { name: 'sidebar.right.tab.document', key: HTML_BODY_ID, locale: NS },
  HtmlTakeoverBody,
))

// 头部：开关（恒对 .html/.htm 出现）与引用按钮变体（仅接管生效时）
ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register(
  { name: 'sidebar.right.tab.document.actions', id: 'side-quote-html-toggle', locale: NS },
  HtmlTakeoverToggle,
))
```

约束：

- `id` 必须同时用作正文 key；缺正文时宿主会渲染 `rendererUnavailable` 占位。
- 定义与正文、按钮、监听必须在同一个 `ctx.effect` 组内登记，任一步失败全部回滚，不得
  留下半注册状态。
- 注册与注销必须幂等；重复生效不产生第二份注册。

## 4. 生效状态机

```text
persistedOn  = localStorage['dsh-side-quote:html-takeover'] === 'on'   // 缺失/非法 → false
gateOpen     = ctx.configForms.developerTools.enabled.getSnapshot()    // 未到达 → false
effective    = persistedOn && gateOpen
```

| persistedOn | gateOpen | 界面 | 注册状态 |
| --- | --- | --- | --- |
| false | 任意 | 开关为关；开关可用（`gateOpen` 为假时仍可点，但只写入偏好） | 不注册任何接管项 |
| true | true | 开关为开 | 定义 + 正文 + 引用按钮全部注册 |
| true | false | 开关为开但呈「暂不可用」，禁用并说明原因 | 不注册任何接管项 |

规则：

- `effective` 的每次跳变只做一次注册或注销；同一状态不得重复注册。
- 闸门快照必须订阅（`enabled.subscribe`），值从 false 变 true 时自动重新接管；反向跳变
  立即回落到自带实现。不得把 `persistedOn` 静默改成 false。
- 读取 `localStorage` 抛错、值非法、或键不存在，一律视为关闭；写入失败不得抛错，也不
  得阻止开关的视觉状态更新（下一次读取仍按 fail-closed 处理）。
- 开启动作触发一次自检并给出**一条**结果通知（成功 `info`，失败按原因 `error`）。自检
  失败不阻止注册状态，但界面必须能表达失败原因。

## 5. iframe 桥

### 5.1 载体

- 正文用 `URL.createObjectURL(new Blob([bootstrap], { type: 'text/html' }))` 承载 iframe，
  卸载时 `revokeObjectURL`。**不用 `srcDoc`**：`srcdoc` 的 base URL 继承父文档，会把
  页面里的相对引用解析到 DSH 服务端口。
- iframe 属性固定：`sandbox="allow-scripts"`，**不得**出现 `allow-same-origin`、
  `allow-forms`、`allow-popups`、`allow-top-navigation`、`allow-modals`。
- 页面字节按 UTF-8 严格解码；解码失败按「渲染失败」处理（正文给出与自带同形的失败行，
  不建立桥，不产生摘录）。

### 5.2 引导脚本（预写注入）

`bootstrap` 是与自带同构的外层文档：`<!doctype html><meta charset="utf-8"><script>…</script>`，
脚本依次完成：

1. 保存 `Document.prototype.getSelection` 的快照引用（防页面覆盖），后续读取一律用它
   `call(document)`。
2. 在 `window` 上以捕获方式安装 `selectionchange` / `mouseup` / `keyup` 监听。`window`
   级监听在 `document.open()` 之后仍然有效（该算法只清除 `document` 及其节点上的监听）。
3. 安装后立即向父页面发一条 `{ kind: 'ready' }`。
4. 事件触发时读取当前选区文本，非空白则上报 `{ kind: 'selection', text }`。
5. 最后 `document.open(); document.write(pageHtml); document.close();`。

约束：

- **不向页面注入 `<script>`**：桥的可用性不得取决于页面 `meta` CSP 的 `script-src`。
- 页面 HTML 以 JSON 编码嵌入外层脚本，并对 `</script>` 做转义；不得用字符串拼接直接
  插入页面内容。
- 桥脚本自身异常必须被捕获并上报 `{ kind: 'error' }`，不得让异常逃逸到 iframe 全局。

### 5.3 协议与校验

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
4. `kind === 'selection'` 时 `text` 必须是字符串且长度 ≤ 65536。

`65536` 只是传输护栏：内容契约最多保留 8000 字符，故该上限从不改变可观察输出。

### 5.4 父侧状态与读取

```text
bridge[iframe] = {
  ready: boolean,          // 收到过 kind === 'ready'
  text: string,            // 最近一次非空白 selection
  failed: boolean,         // 收到 kind === 'error'
  unmounted: boolean,
}
```

- 状态以 iframe 元素为键，只在该正文实例内存在；不使用路径作键（同一文件可能在两个
  窗格各开一次）。

- 每条 `selection` 覆盖前值（只保留最新）；不排队、不累积历史。
- `kind === 'error'` 只把该 iframe 标为失败，不直接弹通知。
- iframe 卸载（含正文卸载、tab 关闭、插件停用）必须删除该 iframe 的条目；全部清理时
  必须连 `window` 的 `message` 监听一起移除。
- 就绪超时：iframe 挂载后 **4000ms** 内未收到 `ready` → 视为桥不可用；超时之后到达的
  `ready` 可以把状态恢复为可用。
- 读取：`readSelection` 同步返回该 iframe 当前 `text`（空白即 `null`）。语义见
  [quote-content-contract.md](quote-content-contract.md) §1。

### 5.5 信任边界（已确认）

页面脚本与桥同 realm，**必然可以伪造上报**；消息令牌不可防（同 realm 可读）。边界是：
桥只上报文本，页面拿不到引用按钮、`insertQuote`、会话作用域或任何宿主对象；插入仍需
用户在父页面点击。该结论必须写进 `code/README.md`，不写成"已验证安全"。

## 6. 归属与适配器接缝扩展

### 6.1 接缝形状（F01 implementation §5 的扩展）

```js
/**
 * target = {
 *   path: string,
 *   document: Document | undefined,
 *   anchor: Element | null,        // 父文档选区锚点（HTML 场景为 null）
 *   tab: { sessionId: string, occurrenceId: string | undefined } | null
 * }
 * Capture = {
 *   text: string,
 *   path: string,
 *   witness?: Element             // 本次读取来源的 iframe；省略即沿用父文档选区校验
 * }
 */
```

### 6.2 `createQuoteActions` 内的判定顺序（唯一核心改动）

```text
1. own = focusedTarget(buttonElement)；own 为空或 own.sessionId !== mountedSessionId → 置灰
2. anchorElement = selectionAnchor()；endElement = selectionEnd()        // 允许为 null
3. adapter = registry.match(path)；无适配器 → 置灰
4. capture = adapter.readSelection({ path, document, anchor: anchorElement, tab: { sessionId, occurrenceId: own.occurrence?.id } })
   capture 为空 / text 非字符串 / text.trim() 为空 → 置灰
5. 归属判定：
   - capture.witness 存在 → 用 focusedTarget(capture.witness) 解析，要求其 sessionId 一致
     且 occurrence.id === own.occurrence.id；不满足 → 置灰（点击路径发一条 error）
   - capture.witness 缺省 → 沿用 F01 三元素校验（anchorElement、endElement 及其 occurrence
     与 own 全等）
6. 归属通过后，插入内容一律使用第 4 步的同一个 capture（不得二次读取）
```

约束：

- 第 5 步的两种分支是接缝的**声明式差异**，核心不得出现按扩展名或格式的 `if`。
- 文本适配器不返回 `witness`，其行为、模板与失败分支逐字不变（F01 U-19 原样通过）。
- `focusedTarget` 抛错、`witness` 解析不到、`capture` 抛错，都按置灰处理，异常不得冒到
  渲染层。

## 7. 头部控件

| 控件 | 出现条件 | 行为 |
| --- | --- | --- |
| 接管开关 `side-quote-html-toggle` | 路径为 `.html` / `.htm`（不看别处） | 点击翻转 `persistedOn` 并即时生效；`gateOpen` 为假时禁用并说明原因 |
| HTML 引用按钮 `side-quote-html-quote` | 仅 `effective === true` 时注册 | 与 F01 文本按钮同形：可用性由桥缓存与归属判定决定；点击走同一条插入/通知路径 |

- 两个控件都必须带稳定标记，供验收断言：`data-side-quote-html-toggle`、
  `data-side-quote-html-quote`；正文容器 `data-side-quote-html`、iframe
  `data-side-quote-html-frame`。
- 引用按钮沿用 F01 的 `mousedown` `preventDefault()` 处理（保住父页面选区语义），
  不采用 `pointerdown`。
- 开关的 `aria-pressed` 反映 `persistedOn`；禁用态必须给出可读原因（tooltip 或
  视觉隐藏说明），不得只置灰。
- 开关与引用按钮的显示条件都**不得**依赖 `ALLOWED_SUFFIXES` / `ALLOWED_FILENAMES`。

## 8. 生命周期与清理

| 资源 | 登记 | 释放 |
| --- | --- | --- |
| `documentPreviews` 定义 | `ctx.effect` | 注销回调 |
| 正文位点 | `ctx.effect` | 注销；注销后核心不得再渲染该正文 |
| 开关位点 | `ctx.effect` | 注销 |
| 引用按钮位点 | `ctx.effect`（仅 effective） | 注销 |
| 闸门快照订阅 | `ctx.effect` | 取消订阅 |
| `window` 的 `message` 监听 | `ctx.effect` | `removeEventListener` |
| 每个 iframe 的 bridge 状态 | 正文挂载 | 卸载即删除 |
| blob URL | 正文挂载 | `revokeObjectURL` |
| 开启自检通知的去重表 | 插件内存 | 插件停用清空 |

"处理中/正在切换"标记必须在 `finally` 语义下清除；任何异常路径都不得让开关卡在禁用态
或让注册处于半完成状态。

## 9. 失败与降级行为

| 场景 | 行为 |
| --- | --- |
| 接管关闭 | 不注册任何项；HTML 预览完全由自带实现渲染；正文像素一致（口径见讨论工作台 C-03） |
| 闸门为假或未到达 | 不接管；开关可用但明示"需要开启开发者工具"，不弹通知（除非用户点击开启） |
| 开启成功 | 一条 `info`；正文切为接管实现 |
| 开启但因闸门不可用 | 一条 `error` 说明原因；不注册 |
| 页面 UTF-8 解码失败 | 正文给出失败行；无桥、无摘录；不额外通知（失败行就是反馈） |
| 桥 4000ms 未就绪 | 引用按钮恒置灰；同一页目标最多一条 `info`（原因：页面无法建立引用桥） |
| 桥收到 `error` | 同上，且不重复通知 |
| 无选区 / 选区仅空白 | 引用按钮置灰；点击竞态下发一条 `error` |
| 归属校验不通过 | 置灰；点击竞态下发一条 `error`，不插入 |
| `insertQuote` 返回 `false` | 一条 `error`，不重试、不降级为 `setDraft`、不写已引用记录 |
| 页面重新导航后桥未恢复 | 按"未就绪"处理，允许后续 `ready` 恢复 |
| 手动切回自带渲染器 | 引用按钮仍存在但恒置灰（该位点拿不到本 tab 选中的实现）；写入 README |
| 插件在接管开启状态下停用 | 全部注册注销、iframe 卸载、blob 回收、监听移除；此后划词无反应 |

## 10. 可能改动的文件

| 文件 | 变更 |
| --- | --- |
| `code/client.js` | 新增接管定义/正文/开关/按钮变体、桥与其状态机、接缝扩展与判定顺序 |
| `code/index.js` | 保持无副作用；预期不改 |
| `code/package.json` | `dependencies` 仍为空；`files` 不变；`dsh.client.inject` 保持现状（服务依赖在工厂 `inject` 数组内声明） |
| `code/test/**` | 新增单元用例（U-20…U-30）与结构断言 |
| `code/test/e2e/**` | 新增端到端用例（E-10…E-18）与子 frame 驱动 |
| `code/README.md` | 已知取舍条目 |
| `wiki/code-ai/project-facts.md` | §5 测试分层补 HTML 接管层 |

## 11. 跨域依赖

- 无跨 owner 依赖（owner 表只有 `core`）。
- 外部只读面：`documentPreviews`、`configForms.developerTools.enabled`、`slots`、
  `sidebarRight`（`mounted` / `focusedTarget`）、`sessions`、`conversation.input`、
  `locale`、`timer`。升级到新 rc 后必须回归，责任在本项目。
- `configForms.developerTools.enabled` 是 Host 存储偏好、由 settings 提供；值未到达时为
  false（fail-closed），实现不得把它当作"默认开启"。

## 12. 测试与验证期望

只引用 Workflow Profile 命令表中的命令：

- 静态检查：`node --check code/index.js`、`node --check code/client.js`
- 单元/集成：`node --test "code/test/**/*.test.mjs"`
- 端到端：`node --test "code/test/e2e/**/*.test.mjs"`（命令已登记；需外部实例与浏览器驱动）
- 验收验证：静态检查 + 单元/集成 + 端到端 + 人工回归，证据形式见
  [testing-and-acceptance.md](testing-and-acceptance.md)。

## 13. 明确推迟出实现的问题

- 相对资源读取/打包 → 已决策不读取，写入 README 取舍。
- 嵌套 iframe、画布、`user-select: none` 页面内文字 → 不支持。
- 内容特征级敏感检测、跨预览体选区、全量「会话已读」→ 仍不属本 Feature。
- 提升 `developerTools` 依赖为可配置项、为桥增加任何校验令牌 → 已被证据否决，不得
  在实现期重新设计。
