# I001-F01 核心域实现文档

> 范围：`core` 域的可执行实现契约。引用内容格式与安全规则见
> [quote-content-contract.md](quote-content-contract.md)；测试与验收见
> [testing-and-acceptance.md](testing-and-acceptance.md)。
> 状态：讨论已确认，待实现。本文档只覆盖文本类预览；HTML 由 `I001-F02` 承担。

## 1. 目的与范围

在 DSH Web 右侧栏的文本类文档预览中，让用户通过工具条上的「引用」按钮把当前选区
组装成带来源路径的引用块，插入当前会话输入框，并对失败与敏感内容给出通知。

范围内：

- 一个手写客户端 bundle 内的通用核心：选区捕获 → 来源归属 → 组装引用 → `insertQuote`
  → `notify`。
- 注册式格式适配器接缝，以及本项目自带的唯一适配器（文本类预览）。
- 事件监听、定时器、订阅的完整释放。
- 中英文案字典。

范围外（不得在本 Feature 内实现）：

- HTML 预览接管与开关（`I001-F02`）；相对资源读取（`I001-F02`）；会话历史的全量
  "已读"推断；内容特征级敏感检测。

## 2. 运行形态与约束

- 客户端 bundle 为手写已构建形态：`window.__ModuleLoader__.load({ id, factory(require) })`，
  纯 JS，无 JSX、无 TypeScript，React 经 `require()` 从平台模块表解析。
- 不新增运行时依赖：`package.json` 的 `dependencies` 保持为空；`files` 只包含运行时
  需要的文件，不含 `test/`。
- 宿主半（`index.js`）保持无副作用：不注册工具、不读取配置、不写文件。
- 不修改、不替换、不卸载任何自带插件包；不读取自带 HTML 预览 iframe 内容。

## 3. 接入位点

所有接入必须使用下列受支持位点；REJECT 项是实现禁令，不是建议。

| 用途 | 位点 | 说明 |
| --- | --- | --- |
| 按钮渲染 | `sidebar.right.tab.document.actions`（`list`，`scope: session`） | 预览头部位点，业主携带 `absolutePath`；仅在文件 Host 路径已知时渲染 |
| 选区归属 | `ctx.sidebarRight.focusedTarget()` | 公共导航服务：返回拥有当前 DOM 焦点的侧栏页面目标（含 `sessionId`、`tabId`、`paneId`、`host`），并原生支持嵌入 iframe |
| 当前会话 | `ctx.sidebarRight.mounted` | 屏幕上会话的快照；决定插入目标 |
| 会话作用域 | `ctx.sessions.scope(sessionId)` | 失败时必须按失败路径处理，不得吞掉 |
| 插入与通知 | `ctx.conversation.input.for(scope)` 的 `insertQuote(text, summary)` / `notify(level, text)` | 唯一插入与通知通道 |
| 工作区根 | `ctx.sessions.binding(sessionId)?.session.projections.faceOf('workingDirectory').getSnapshot()` | 用于把 `absolutePath` 相对化；可能为空，必须按失败路径处理 |
| 文案 | `ctx.locale.register(NS, { zh, en })` | 中英双语 |
| 定时器 | `ctx.timer.debounce(fn, 350)` 或插件自有受管定时器 | 必须随插件停用释放 |

REJECT（实现禁令）：

- 通过 `data-textpreview-*`、CSS module 类名、DOM 层级或 React 内部结构判断"这是文本
  预览体"。这些是自带插件的内部细节，升级即断。
- 直接操作输入框 DOM 或编辑器实例；只允许 `insertQuote` / `notify` / `focus`。
- 修改自带插件注册的任何位点内容，或在自带插件 id 下注册组件。

### 3.1 归属校验（实现前提，结论已回写）

目标语义：
1. 选区所属的侧栏页目标必须与按钮自身所在的侧栏页目标是**同一个 tab 实例**。
2. 该目标的 `sessionId` 必须等于 `sidebarRight.mounted` 的当前会话；不等则按钮置灰。
3. 同一 tab 实例即同一文件、同一预览体；不一致（多窗格同时开着两个文本预览时）
   则按钮置灰。

实现期只读取的受支持位点：
- `ctx.sidebarRight.mounted`（`ObservableSnapshot<SessionId | undefined>`，整列一个会话 id，
  不含窗格/标签粒度）。
- `ctx.sidebarRight.focusedTarget(element?: Element | null)`：返回
  `{ sessionId, paneId, host, tabId?, occurrence?, navigationRevision? }`；不传参时以
  `document.activeElement` 为目标元素，传元素时按该元素的祖先归属解析（内部经
  `sidebarTargetFromElement`，不依赖 Self 之外的任何判断）。
- `target.occurrence.id`（`TabOccurrence.id`，一次打开生命周期一个值）用于身份比较；
  `target.occurrence.navigation.getSnapshot()` 返回 `{ address, params, revision }`，
  可作为一致性校验，但**地址相等只证明同一文件**，在两个窗格各开同一文件时无法区分，
  故不得单独用作第 3 步判据。

已验证结论（`0.2.2-rc.3`，依据打包 `lib/types/**` 与 `src`，运行期仍须 e2e 复核）：

| 结论 | 证据 |
| --- | --- |
| `focusedTarget(element)` 可解析任意位于 tab body 内的元素所属 tab/pane | `dsh-client-ui-sidebar-right/src/client/focus.ts`（`sidebarTargetFromElement` 只看 `element.closest` 祖先链与布局有效性）、`src/client/service.ts`（`focusedTarget`，`commandTarget` 同路调用） |
| 无参 `focusedTarget()` 取 `document.activeElement` | 同上，默认参数在方法签名内 |
| `occurrence.navigation` 运行期有值，`address === tab.contentId` | `src/client/tab-domain.ts`（`sync` 播种、`navigate` 重建）、`contract/slots.ts`（`SidebarRightTabNavigation`） |
| `focusedTarget` 可能抛错（`occurrence()` 对未 sync 的新 tab 抛） | `src/client/tab-domain.ts`；调用方必须 `try/catch` 并置灰 |
| 按钮所在位点的 owner props 只有 `{ absolutePath }`，无 tabId/paneId | `dsh-client-ui-sidebar-documentpreview/src/client/document/contract.ts` |

因此实现取"两元素 + 身份比较"，不解码地址、不读任何 DOM 属性、不碰自带插件私有字段：

```js
const own = safeTarget(buttonEl)            // 本按钮所在 tab
const sel = safeTarget(anchorElement)       // 选区锚点（anchorNode）所在 tab
const end = safeTarget(focusElement)        // 选区终点（focusNode / range.endContainer）所在 tab
const ok = own && sel && end
  && own.sessionId === mountedSessionId
  && own.occurrence && sel.occurrence && end.occurrence
  && own.occurrence.id === sel.occurrence.id && own.occurrence.id === end.occurrence.id
```

**起点与终点都必须判定**：跨预览体的选区在浏览器里是一条合法选区，只判锚点会让 A 的按钮
读取到跨越到 B 的整段文本、却按 A 的路径写 `来源：`，并绕过 B 的敏感名警示（评审 H-1）。
终点侧解析不到元素时按"置灰"处理，不得退化成只判锚点。

只有在 e2e 证明该路径不可用时才按"减少能力"处理（只保留会话级校验并置灰多窗格歧义），
并记入 README 取舍；不得猜测归属。地址读取途径本身已确认存在，无需降级。

## 4. 核心流程

```text
[selectionchange / pointerup + keyup]
  → debounce 350ms 定稿按钮状态（可用 / 置灰）
    → 判定：同一预览体内存在非空白选区？归属校验通过？白名单命中？
      → 是：按钮可用
      → 否：按钮置灰
[点击按钮]
  → 处理中标记（重复点击直接返回）
    → 重新读取选区文本（以点击时刻为准，不用防抖缓存）
      → 空或空白：error 通知，结束
    → 解析来源路径：absolutePath → 工作区相对化
    → 查询已引用记录（sessionId + 相对路径）
      → 已存在：生成指针块
      → 不存在：读取摘录 → 截断 → 生成原文块
    → 敏感名单命中：发出一条 info 警示（不阻断插入）
    → insertQuote(text, summary)
      → false：error 通知，结束（不得重试、不得降级为 setDraft）
      → true：写入已引用记录
  → 清除处理中标记
```

要点：

- 防抖只决定**按钮状态**；点击永远以点击时刻的选区为准。因此"防抖窗口内点击"与
  "防抖后点击"结果一致。
- 已引用记录只在 `insertQuote` 返回 `true` 后写入；插入失败不得污染记录。
- 一次点击最多产生一条通知（失败 → 一条 error；敏感命中且插入成功 → 一条 info）。
- `summary` 只用于输入框内的可读展示；其中 `title` 是同一来源路径的**展示副本**
  （见 [quote-content-contract.md](quote-content-contract.md) §7），不进入消息正文。
  **进入消息正文**的来源路径只有 `text` 里的 `来源：` 行，因为只有 `text` 会发送给模型。

## 5. 适配器接缝

```js
/**
 * 形状契约（手写 JS，无类型标注；此处仅示意）
 * {
 *   id: string,                       // 唯一实现名
 *   match(path: string): boolean,     // 决定本适配器是否接管该路径
 *   readSelection(target): Capture | null
 * }
 * Capture = { text: string, path: string }   // 已规范化的摘录文本与来源路径
 */
```

- 核心只依赖 `id`、`match`、`readSelection` 三个成员；不得出现按扩展名或按格式的
  `if` 分支。
- 适配器注册与注销必须幂等；重复 `id` 必须抛错，不得静默覆盖。
- 本项目自带适配器只处理"父页面 DOM 可读选区"的文本类格式，其 `match` 委托给
  [格式白名单](quote-content-contract.md#3-格式白名单)。
- `readSelection` 返回 `null` 表示"本适配器此刻无法提供选区"，核心据此置灰按钮，不得
  回退去猜。
- F02 引入 HTML 适配器时，必须能够只新增一个适配器文件并注册，不修改本节之外的任何
  核心代码；实现时必须用一个假适配器在单元测试中证明这一点。

## 6. 生命周期与清理

插件必须在 `ctx.effect(...)`（或等效的受管注册）中登记以下每一项，保证停用时全部释放：

| 资源 | 释放要求 |
| --- | --- |
| `selectionchange` 监听 | 移除监听 |
| `pointerup` / `keyup` 监听 | 移除监听 |
| 350ms 防抖定时器 | `dispose()`；停用后不得再触发一次状态定稿 |
| 适配器注册 | 注销回调；注销后核心不得再调用其 `match` / `readSelection` |
| 会话作用域订阅 | 取消订阅 |
| 本地化字典 | 注销 |
| 位点注册（按钮组件） | 注销 |
| 已引用记录 | 属于插件内存状态，随插件停用清空；不得持久化到任何存储 |

"处理中"标记必须在 `finally` 语义下清除；任何异常路径都不得让按钮永久卡在禁用态。
单个适配器抛错必须被核心捕获并转为一次 error 通知，不得让异常冒到宿主渲染层。

## 7. 数据契约：已引用记录

```text
记录键：`${sessionId}\u0000${workspaceRelativePath}`
记录值：{ firstQuotedAt: number }
作用域：插件内存，按会话隔离；插件停用即清空
```

- 只记录**成功插入**过的路径。
- 键包含 `sessionId`，因此不同会话互不影响；同一会话跨预览重开仍生效（记录不随
  tab 关闭而清除）。
- 不持久化：DSH 重启或插件停用后重新开始。
- 记录上限：保留最近 500 条，超出按插入顺序淘汰，避免无限增长。

## 8. 失败与边界行为

| 场景 | 行为 |
| --- | --- |
| 无屏幕会话（`mounted` 为空） | 按钮置灰；竞态点击不插入，且无可用通知通道（§8.1），表现为静默 |
| `sessions.scope()` 返回 `undefined` | 按钮置灰（状态计算即要求作用域可用）；竞态下点击则无可用通知通道，静默且不插入（见 §8.1） |
| 选区为空或仅空白 | 按钮置灰；竞态下点击则 `error` 通知 |
| 选区跨越两个预览体 | 按钮置灰（不支持） |
| 归属校验不通过 | 按钮置灰 |
| 路径无法相对化（工作区外 / 工作区根未知） | 保留原样路径继续插入（不阻断），并在通知中不额外提示 |
| 敏感文件名命中且插入成功 | 一条 `info` 警示 |
| `insertQuote` 返回 `false` | `error` 通知，不重试、不降级为 `setDraft`、不写记录 |
| 适配器 `readSelection` 抛错 | `error` 通知，按钮恢复可用 |
| 预览在点击前被关闭 / tab 切换 | 归属校验失败 → `error` 通知 |
| 同一文件第二次及以后 | 插入指针块（见内容契约） |
| `conversation.input.for(scope)` 抛错（会话未保留） | 按钮置灰（作用域不可用）；竞态点击不插入，通知因同一原因不可投递（§8.1），表现为静默 |
| 插入成功 | 插件自身不再调用 `focus` / 滚动 / 清选区；平台 `insertQuote` 成功路径内部会把键盘焦点移回输入框（`preventScroll: true`），不可由插件阻止，记为已知取舍 |

### 8.1 插入侧副作用的边界（已核实，非缺陷）

- `SessionInput.insertQuote(text, summary?)` 在 `text.trim() === ''`、facade 已释放、
  `state.phase !== 'plain'`（发送/裁决/提交中）或 `quoteInsertionAllowed() === false` 时
  返回 `false`；成功时平台内部执行 `focus()`。
- 因此"插入后不抢焦点"的可实现含义是：**插件不主动移动焦点、不滚动、不清选区**；
  焦点回到输入框属于插入通道的固有行为，写入 `code/README.md` 的已知取舍。
- 选区的读取时机仍是点击时刻；按钮必须在 **`mousedown`** 上 `preventDefault()`，
  以免浏览器在按下时折叠预览选区（否则点击时读到空选区）。该处理不触碰输入框 DOM。
- 实现期实测结论：`pointerdown` 的 `preventDefault()` 会抑制兼容鼠标事件、存在吞掉后续
  `click` 的风险，因此不采用；采用 `mousedown` 并由端到端用例证明点击确实到达处理器。

**通知通道的真实边界（评审 W-4，已核实）**：`notify` 是**会话绑定**的通道
（`conversation.input.for(scope).notify`）。因此当"没有屏幕会话（`mounted` 为空）"或
"`sessions.scope(sessionId)` 为空"时，本插件没有可投递的通知位点，这两种状态下的竞态点击
表现为静默且不插入。为减少静默面，按钮状态计算本身要求会话作用域可用，使这两种状态正常
表现为置灰；其余失败分支（选区为空、归属不符、读取失败、插入被拒）都有会话作用域，
各自只发一条 `error`。`conversation.input.for(scope)` 若因同一作用域缺失而抛错，其失败通知
同样不可投递，表现为静默；本版不为此引入会话无关的通知位点（属新增外部面，需另开评审面）。
该边界记入 `code/README.md` 的已知取舍。

## 9. 可能改动的文件

| 文件 | 变更 |
| --- | --- |
| `code/client.js` | 客户端 bundle：核心、适配器注册、含按钮组件 |
| `code/index.js` | 保持无副作用；仅在确有必要时导出常量 |
| `code/package.json` | 维持零依赖；`dsh.client.inject` 需补入实际使用的客户端服务 |
| `code/cordis.patch.yml` | 若无变更则不动 |
| `code/test/**` | 新增单元测试（见测试文档） |
| `code/test/e2e/**` | 新增 e2e 自动化脚本（见测试文档） |
| `.factory/factory.yaml` 与 `wiki/governance/workflow-profile.md` | 新增 e2e 命令并重新生成 |
| `wiki/code-ai/project-facts.md` | 同步 §4 命令表与 §5 测试分层 |
| `code/README.md` | 写入已知取舍条目 |

`code/client.js` 预计显著增长。实现期核实（评审 N-1）：客户端 bundle 由同源 **classic
`<script src>`** 载入，`package.json` 的 `exports["./client"]` 与 `dsh.client` 只声明单一入口，
`require()` 只能解析平台模块表；包内多文件只能走 `require.async` 的 chunk 机制，属新的加载
时序与 HMR 风险面。因此本版**保持单文件**（实际 902 行 / 851 非空行），并把"不拆的理由"记入
`code/README.md`，不按行数硬拆。

## 10. 跨域依赖

- 无跨 owner 依赖：本项目 owner 表只有 `core`。
- 外部依赖面（只读、不改）：DSH 客户端服务 `sidebarRight`、`sessions`、`conversation`、
  `locale`、`timer`、`slots`。版本升级后必须回归，责任记入 README。

## 11. 测试与验证期望

只引用 Workflow Profile 命令表中的命令：

- 静态检查：`node --check code/index.js`、`node --check code/client.js`
- 单元/集成：`node --test "code/test/**/*.test.mjs"`
- 验收验证：上述三条的组合

端到端层命令在本 Feature 实现阶段登记进 `.factory/factory.yaml` 后，才可被引用；
登记前不得声称 e2e 已验证。端到端环境、证据形式与用例见
[testing-and-acceptance.md](testing-and-acceptance.md)。

## 12. 明确推迟出实现的问题

- HTML 接管与默认关闭开关 → `I001-F02`。
- 相对资源读取 → `I001-F02`。
- 覆盖 agent 自身读取行为的全量"已读"判定 → 需新 Feature。
- 内容特征级敏感检测 → 未采纳，写入 README 取舍。
- 跨预览体选区引用 → 不支持，写入 README 取舍。

第 3.1 节的地址读取方式选择是实现期验证事项，不是产品问题；实现者不得因此回到需求
讨论。
