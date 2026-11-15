# 初始化基线证据

Status: passed

本文件记录首次跑通各条已配置命令的结果，是后续所有回归比较的基线。`factory init`
写入同名骨架时状态为 pending；本次所有已配置命令真实执行并全部通过，故置为
`Status: passed`（等价于模板所写的「已记录」状态，同时清除 doctor 的
`BASELINE_PENDING` 警告）。

## 记录要求

- 每条命令都要有：日期、执行环境、命令原文、期望、实际结果。
- 原始输出（日志、截图、JSON）放在 `wiki/validation/` 下，并在本文件索引。
- 结果只允许「通过 / 失败 / 不适用」；失败不得写成「基本通过」。
- 证据中不得出现真实密钥、完整账号或私有端点。

## 执行环境

| 项 | 值 |
| --- | --- |
| 日期 | 2026-11-15 |
| 平台 | Windows，PowerShell 7（`pwsh`） |
| 工作目录 | 工作仓库根（相对路径均相对仓库根） |
| Node | v24.22.2 |
| factory | HighLand-factory 0.1.0（python 3.12.13 + PyYAML 6.0.3） |
| 代码状态 | 仅「零逻辑安装骨架」：`code/package.json`、`index.js`、`client.js`、`cordis.patch.yml`、`code/test/module-shape.test.mjs` |

## 命令基线

| 动作 | 命令 | 期望 | 实际 |
| --- | --- | --- | --- |
| 安装 / 初始化 | _未配置_ | 成功 | 不适用（零构建、无运行时依赖，尚无安装步骤） |
| 构建 | _未配置_ | 成功 | 不适用（零构建插件，`client.js` 即浏览器模块） |
| 静态检查 | `node --check code/index.js` | exit 0 | 通过（exit 0） |
| 静态检查 | `node --check code/client.js` | exit 0 | 通过（exit 0） |
| 测试 | `node --test "code/test/**/*.test.mjs"` | 全部通过 | 通过（3 tests / 3 pass / 0 fail，exit 0） |
| 类型检查 | _未配置_ | — | 不适用（纯 JavaScript，无类型检查工具链） |
| 端到端 | _未配置_ | — | 不适用（浏览器内行为需人工验收，见下方已知缺口） |
| 开发服务 | _未配置_ | — | 不适用（由 DSH Web `127.0.0.1:3081` 提供，不由本仓库启动） |
| 验收验证 | `node --check code/index.js`、`node --check code/client.js`、`node --test "code/test/**/*.test.mjs"` | 全部通过 | 通过（三条均 exit 0） |

命令来自 `.factory/factory.yaml` 的 `commands`，摘要见
[Workflow Profile](../governance/workflow-profile.md)。命令为空说明尚未配置，不能据此
声称验证通过。

## 测试覆盖范围

`code/test/module-shape.test.mjs` 只证明安装骨架可被零构建加载，共三条：

1. `package.json` 声明 `dsh.bundle.patch` 与 `platform: web` 的 client half；
2. `index.js` 导出 `apply()`；
3. `client.js` 通过 `window.__ModuleLoader__.load` 注册模块 `dsh-side-quote`，且工厂返回
   `inject`（数组）与 `apply()`。

它不验证任何划词、引用插入或渲染器接管行为——这些能力尚未实现。

## 已知缺口

| 缺口 | 原因 | 复查触发条件 |
| --- | --- | --- |
| 浏览器内行为无自动化验收 | 划词、`postMessage` 桥、`insertQuote`、渲染器下拉项都需要真实页面与人工操作 | 第一个 Leaf Feature 落地实现后，补充可重复的验收证据，并把 `commands.e2e` 真正配置起来 |
| `commands.setup` / `build` / `typecheck` / `e2e` / `dev` 为空 | 零构建、零运行时依赖，项目形态决定这些命令长期不适用 | 若引入打包器、类型系统或 dev server，先改 `.factory/factory.yaml` 再重记基线 |
| 插件未安装到 web profile | 初始化阶段不实现业务功能，也不改用户 profile 与其正在运行的服务 | 首个 Feature 的「安装与生效」步骤，需用户授权后执行 |

## 证据索引

| 证据 | 说明 |
| --- | --- |
| 本文件「命令基线」表 | 首次基线：lint 2 条、test 1 条、verify 3 条，均 exit 0；输出为 3 个通过用例，无日志文件需要归档 |
