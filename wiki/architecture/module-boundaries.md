# 系统边界与模块划分

> 权威范围：本文件是 dsh-side-quote 运行形态、与平台自带实现的边界、允许依赖的外部面、
> 模块内分层，以及数据与安全边界的唯一权威。用户可见能力见
> [产品目标](../product/product-vision.md)，实现细节见
> [前端实现](../implementation/frontend/sidebar-quote-implementation.md)。

## 1. 运行形态

- 本插件是 DeepSeek Harness 0.2.2-rc.3 的客户端插件，由一个客户端 bundle 与一个宿主半组成。
- 客户端 bundle 是**手写已构建形态**：`window.__ModuleLoader__.load({ id, factory(require) })`，
  纯 JavaScript，无 JSX、无 TypeScript；React 等基座模块经 `require()` 从平台模块表解析。
  「零构建」的含义就是手写该格式，不引入构建链。
- 宿主半（`code/index.js`）保持无副作用：不注册工具、不读取配置、不写文件。
- `code/package.json` 的 `dependencies` 为空，制品 `files` 不含测试目录。

## 2. 与平台自带实现的边界

- 不修改、不替换、不卸载任何自带插件包。
- 只使用受支持的公开位点与公开服务。实现禁令：按 `data-*` 属性、CSS module 类名、DOM
  层级或 React 内部结构判断「这是哪种预览体」；直接操作输入框 DOM 或编辑器实例；在自带
  插件 id 下注册组件。
- 归属判定只经 `ctx.sidebarRight.focusedTarget()` 解析页目标身份，不自行解码地址、不读
  自带插件的私有字段。

## 3. 外部只读依赖面

| 服务 | 用途 |
| --- | --- |
| `slots` | 在受支持位点注册头部按钮组件 |
| `sidebarRight` | 读取屏幕上的会话（`mounted`）与按元素解析页目标（`focusedTarget`） |
| `sessions` | 取得会话作用域（`scope`）与会话工作区根（用于来源路径相对化） |
| `conversation` | `conversation.input.for(scope)` 的 `insertQuote` 与 `notify`，唯一的插入与通知通道 |
| `locale` | 注册中英双语文案字典 |
| `timer` | 受管定时器，用于按钮状态的防抖 |

以上服务全部只读使用；升级到新的 DSH 版本后必须回归。

## 4. 接入位点

| 用途 | 位点 | 约束 |
| --- | --- | --- |
| 按钮渲染 | `sidebar.right.tab.document.actions`（`list`，`scope: session`） | 位点 owner props 只有 `absolutePath`；不假设存在 tabId/paneId |
| 选区归属 | `ctx.sidebarRight.focusedTarget(element?)` | 以返回的页目标身份（含 `occurrence`）比较，跨窗格歧义时置灰 |
| 当前会话 | `ctx.sidebarRight.mounted` | 决定插入目标；与选区所属会话不一致时置灰 |
| 插入与通知 | `ctx.conversation.input.for(scope)` | 唯一通道；失败按失败路径处理，不回退到 `setDraft` |

## 5. 模块内分层

代码集中在单文件 `code/client.js`，内部按职责分为三层，层间只通过显式注入的依赖通信：

1. **内容层**：格式白名单、路径相对化、截断、引用块与指针块模板、敏感名单、已引用记录；
2. **接缝与状态层**：适配器注册表、按钮状态防抖、点击去重、插入/通知路径、生命周期；
3. **接线层**：React 组件、位点注册、`ctx.effect` 资源登记。

`factory()` 返回值中的 `internals` 面把纯逻辑与状态逻辑暴露给 `node:test`。该面**仅测试
可见**，不是公共 API，也不构成对外契约。

保留单文件而不是拆分模块，是因为客户端 bundle 由同源 classic `<script>` 单入口载入，
包内多文件只能走异步 chunk 机制，会引入新的加载时序与热更新风险面。

## 6. 数据边界

- 唯一持久状态是插件内存里的「已引用记录」（键为会话 + 工作区相对路径，容量 500 条，
  插件停用即清空，不写任何存储）。
- 不读写数据库、不做数据迁移、不写项目文件、不引入 Host 侧配置面。

## 7. 安全与敏感边界

- 引用会把文件内容与工作区相对路径送入会话并发送给模型，同时命中
  `local-machine-paths` 与 `credentials` 两个敏感类别；规则见
  [前端契约](../implementation/frontend/sidebar-quote-contract.md)。
- 证据、日志与提交信息不得出现真实机密；夹具只用合成占位值；端到端取证只在独立 profile
  与独立端口进行，不触碰用户正在使用的实例。

## 8. 责任域

owner 表只有 `core` 一个责任域，可执行内容全部落在 `code/`。不存在跨 owner 的契约
边界，因此不引入额外域。
