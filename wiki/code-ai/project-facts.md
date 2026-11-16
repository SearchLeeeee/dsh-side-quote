# 项目工程事实

> 项目：dsh-side-quote（`dsh-side-quote`）
> 文档主语言：zh-CN
> 最近生成：2026-11-16（工厂版本 0.1.0）
> 本页只记录**稳定、可验证**的工程事实。易变内容一律不写在这里。

## 1. 使用边界

本页回答“这个项目由什么组成、怎么跑、怎么验证”，是阅读角色的关键事实来源（在项目规范与权威映射之后阅读）。允许写入：

- 仓库与目录布局、模块边界、生成物与手工维护文件的区别；
- 技术栈与关键依赖的**事实性**描述；
- 团队成员可复用的真实命令（由生成器从项目配置填充，不手写）；
- 测试分层、数据与迁移策略、权威包边界。

禁止写入：当前任务状态、进行中的决定、个人分工、临时环境、一次性排查结论、凭据或内网地址。上述内容应回到项目权威文档或任务系统。

## 2. 仓库布局

| 路径 | 作用 |
| --- | --- |
| `code/` | 实现代码 |
| `wiki/` | 长期权威文档与工作区 |
| `wiki/feature-workspace/` | Initiative / Leaf Feature 过程工作区，默认隔离。 |
| `wiki/quick-workspace/` | Quick Change 过程记录，默认隔离。 |
| `wiki/refactor-workspace/` | 手动扫描与重构的独立过程记录，默认隔离。 |
| `wiki/code-ai/` | Agent profiles 与通用约束 |

布局变化（新增顶层目录、移动权威文档、拆分仓库）时，必须同一次变更内更新本表。

## 3. 技术栈摘要

- JavaScript（浏览器 classic-script bundle + ESM 宿主半，零构建、零运行时依赖）
- DSH 0.2.2-rc.3 client plugin（cordis slots / documentPreviews / conversation input）
- Node 24 / pnpm 11（仅开发与本机安装）

只写事实，不写评价与选型理由；选型理由属于项目决策文档。

## 4. 真实命令

### 静态检查 (`lint`)

```bash
node --check code/index.js
node --check code/client.js
```
### 单元/集成测试 (`test`)

```bash
node --test --test-concurrency=1 "code/test/**/*.test.mjs"
```
### 端到端测试 (`e2e`)

```bash
node --test --test-concurrency=1 "code/test/e2e/**/*.test.mjs"
```
### 验收验证 (`verify`)

```bash
node --check code/index.js
node --check code/client.js
node --test --test-concurrency=1 "code/test/**/*.test.mjs"
```

`--test-concurrency=1` 是端到端用例的硬要求：`E-08`、`E-10`、`E-16`、`E-18` 会改变实例全局
状态（插件启停、接管开关、开发者工具闸门），并发执行会互相干扰并产生假失败。该约束登记在
`.factory/factory.yaml` 的命令表中，由 `factory upgrade` 生成到 Workflow Profile。

命令必须来自项目配置，能在干净环境中复现。不要在本页手写“大概能用”的命令；命令失效时先修生成源，再重新生成。

## 5. 测试分层

| 层 | 承载 | 运行方式 | 能证明什么 |
| --- | --- | --- | --- |
| 单元层 | 引用内容模板与保真、截断、路径相对化、格式白名单、敏感名单、已引用记录、防抖与点击去重、清理、适配器接缝、`summary` 契约、中英字典 | `node --test --test-concurrency=1 "code/test/**/*.test.mjs"` | 纯逻辑正确性；无需浏览器与 DSH 实例 |
| 端到端层 | 真实 DSH 侧栏里的划词 → 按钮可用性 → 插入 → 通知，以及各格式零影响 | `node --test --test-concurrency=1 "code/test/e2e/**/*.test.mjs"`（需外部实例与浏览器驱动） | 浏览器主链路 |
| HTML 接管层（单元） | 接管开关的持久化 fail-closed、闸门状态机、iframe 桥报文校验与 4000ms 就绪超时、按 iframe 隔离与卸载清理、`sandbox` 只含 `allow-scripts` 的结构断言、中英字典新增键 | `node --test --test-concurrency=1 "code/test/**/*.test.mjs"` | 接管逻辑与状态逻辑；无需浏览器 |
| HTML 接管层（端到端） | 关闭态正文与插件停用逐字节一致、开启自检与通知预算、真实拖选引用、CSP 页面、同文件指针块、闸门关闭、开启后关闭、停用清理 | `node --test --test-concurrency=1 "code/test/e2e/html-takeover.test.mjs"`（需外部实例与浏览器驱动） | 接管后的浏览器主链路与安全性可观察面 |
| 人工回归层 | 非文本格式（pdf / png / xlsx / docx）与 `.html` 的预览表现：自带渲染 vs 接管渲染的可读性、可选择性、外部资源未加载 | 人眼逐格式确认 + 截图 | 未破坏既有预览，接管后仍可用 |

HTML 接管层的端到端用例要驱动不透明 origin 的 iframe：选区由 CDP
`Input.dispatchMouseEvent` 的真实按压 → 多次移动 → 释放驱动，证据记为
`selectionDrive: 'mouse'`；子 frame 只用于测量文字几何与读回选区（`Target.attachToTarget`
或 `Page.createIsolatedWorld` 两条路径）。若某次运行改用 `Target.setAutoAttach` 后在子 frame
合成 `Range`，证据必须记为 `selectionDrive: 'synthetic-range'`，不得当作物理拖选；截图
sidecar 同时记录接管状态与观察到的 iframe `sandbox` 属性。

端到端层通过环境变量连接已存在的外部实例，脚本自身不启动服务、不自带浏览器驱动、不新增
运行时依赖：

- `SIDE_QUOTE_E2E_BASE_URL`：实例地址（含 token），默认 `http://127.0.0.1:3181`；
- `SIDE_QUOTE_E2E_CDP`：浏览器 CDP 端点，接受 `ws://…` 或 `http://host:port`；
- `SIDE_QUOTE_E2E_EVIDENCE_DIR`：必需，截图与 sidecar 的写入目录；
- `SIDE_QUOTE_E2E_PROFILE`：必需，实例 profile 名，写入 sidecar 作为隔离身份；
- `SIDE_QUOTE_E2E_ALLOW_LIVE`：显式放行对 `3081` 运行，只在明确授权时设为 `1`。

变量缺失时用例以 `skip` 结束，理由写明「未提供 DSH 实例」「未提供浏览器驱动」
「未提供证据目录」或「未提供实例 profile」。**`skip` 不等于通过**：验收记录必须把它写成
「未执行」。

任何「已验证」结论都不得只引用静态检查或单元层的通过结果；浏览器行为必须有端到端证据。
证据与判定责任见 `wiki/validation/`。

## 6. 迁移与数据策略（初始化占位）

> 待初始化：说明 schema 或数据迁移的编排方式、向后兼容窗口、回滚方式、生产数据访问边界与审批要求。

在补全前，涉及数据写入、删除、迁移或生产读取的工作默认按高风险处理，必须先取得授权。

## 7. 权威包边界（初始化占位）

> 待初始化：列出权威包或模块、各自负责的契约、允许的依赖方向，以及禁止跨边界直接引用的对象。

边界未明确时，实现角色不得自行决定依赖方向；应停止并请求 owner 确认。

## 8. 更新规则

- 只有可验证的事实才能进入本页；推测、计划、愿望不进入。
- 每次改变布局、技术栈、命令或边界，必须在同一次变更中更新本页并说明验证方式。
- 本页与代码冲突时，以代码与项目权威文档为准，并立即修正本页。
- 本页不复制约束块内容；需要约束时从 [_blocks/README.md](_blocks/README.md) 进入。
