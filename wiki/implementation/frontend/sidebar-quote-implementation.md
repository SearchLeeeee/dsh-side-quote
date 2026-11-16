# 引用实现契约

> 权威范围：本文件是引用能力的可执行实现契约——接入位点、归属校验、核心流程、适配器接缝、
> 生命周期清理、失败与边界行为。内容格式见[引用内容契约](sidebar-quote-contract.md)，
> 系统边界见[系统边界与模块划分](../../architecture/module-boundaries.md)。

## 1. 目的与范围

在右侧栏的文本类文档预览中，让用户通过头部「引用」按钮把当前选区组装成带来源路径的引用
块插入当前会话输入框，并对失败与敏感内容给出通知。

范围内：手写客户端 bundle 内的通用核心（选区捕获 → 来源归属 → 组装引用 → `insertQuote`
→ `notify`）、注册式格式适配器接缝与文本适配器、事件与定时器的完整释放、中英文案。

范围外：HTML 预览的引用能力、相对资源读取、会话历史的全量「已读」推断、内容特征级敏感
检测（均见[产品目标](../../product/product-vision.md)的边界）。

## 2. 接入位点

全部接入只使用下列受支持位点；REJECT 项是实现禁令，不是建议。

| 用途 | 位点 | 说明 |
| --- | --- | --- |
| 按钮渲染 | `sidebar.right.tab.document.actions`（`list`，`scope: session`） | 位点业主携带 `absolutePath`；仅在文件 Host 路径已知时渲染 |
| 选区归属 | `ctx.sidebarRight.focusedTarget()` | 返回拥有当前焦点的侧栏页目标（含 `sessionId`、`paneId`、`tabId`、`occurrence`） |
| 当前会话 | `ctx.sidebarRight.mounted` | 屏幕上会话的快照；决定插入目标 |
| 会话作用域 | `ctx.sessions.scope(sessionId)` | 为空必须按失败路径处理 |
| 插入与通知 | `ctx.conversation.input.for(scope)` 的 `insertQuote` / `notify` | 唯一插入与通知通道 |
| 工作区根 | `ctx.sessions.binding(sessionId)?.session.projections.faceOf('workingDirectory')` | 用于把绝对路径相对化；可能为空 |
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
 * Capture = { text: string, path: string }
 */
```

- 核心只依赖 `id`、`match`、`readSelection` 三个成员；不得出现按扩展名或按格式的 `if` 分支。
- 适配器注册与注销必须幂等；重复 `id` 必须抛错，不得静默覆盖。
- 自带文本适配器只处理「父页面 DOM 可读选区」的文本类格式，其 `match` 委托给格式白名单。
- `readSelection` 返回 `null` 表示「本适配器此刻无法提供选区」，核心据此置灰，不得回退去猜。
- 新增可引用格式只允许新增一个适配器，不修改本节之外的核心代码；该可证性由单元测试以
  假适配器断言。

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

## 9. 跨域依赖

- 无跨 owner 依赖：本项目 owner 表只有 `core`。
- 外部依赖面只读：`slots`、`sidebarRight`、`sessions`、`conversation`、`locale`、`timer`。
  版本升级后必须回归，责任在本项目。

## 10. 测试与验证期望

命令只取自 Workflow Profile 的命令表：静态检查（两条 `node --check`）、单元/集成测试、
端到端测试。端到端环境、用例与证据形式见[测试与验收](../../testing/sidebar-quote-acceptance.md)。
