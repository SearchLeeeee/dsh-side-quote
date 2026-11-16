# dsh-side-quote

DSH Web 客户端插件：在右侧栏的文本类文档预览里划词，用预览头部的「引用」按钮把选中文字
组装成带来源路径的引用块，插入当前会话的输入框。

零构建、零运行时依赖：`client.js` 本身就是 DSH 客户端加载器要的已构建 bundle
（`window.__ModuleLoader__.load({ id, factory(require) })`，纯 JS，React 从平台模块表解析）。
本包不含构建链、JSX 或 TypeScript 源文件，`package.json` 的 `dependencies` 为空，
`files` 不含 `test`。

## 目录

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主半：保持无副作用（不注册工具、不读配置、不写文件） |
| `client.js` | 浏览器半：引用内容契约、格式适配器接缝、按钮组件、生命周期接线 |
| `cordis.patch.yml` | bundle 插入补丁 |
| `test/` | 单元层与端到端层用例，不进入制品 |

## 行为

- 预览头部出现「引用」按钮，仅当**同一预览体内**存在非空白选区、且该预览属于当前屏幕会话时
  可用；否则置灰。
- 点击后插入「摘录 + 空行 + `来源：<工作区相对路径>`」。同一会话内同一文件自第二次起插入
  指针块（只给路径，不重复贴原文）。
- 失败发一条 `error` 通知；敏感文件名命中时额外发一条 `info` 警示（不阻断插入）。
- 支持的格式由 `client.js` 顶部的 `ALLOWED_SUFFIXES` / `ALLOWED_FILENAMES` 两个常量唯一声明；
  `html` / `htm` 明确不在其中。

## 验证

```bash
node --check code/index.js
node --check code/client.js
node --test "code/test/**/*.test.mjs"
```

端到端层需要已存在的外部实例与浏览器驱动（PowerShell）：

```powershell
$env:SIDE_QUOTE_E2E_BASE_URL = 'http://127.0.0.1:<port>/?token=<boot token>'
$env:SIDE_QUOTE_E2E_CDP      = 'http://127.0.0.1:<cdp port>'
$env:SIDE_QUOTE_E2E_EVIDENCE_DIR = '<evidence dir>'   # 必需：截图与 sidecar 落这里
node --test "code/test/e2e/**/*.test.mjs"
```

**实际端口以验收环境文档为准**：`3181` 只是默认值，在本机它落在 Windows 保留端口段
（`netsh interface ipv4 show excludedportrange protocol=tcp` 的 3119–3218）内、无法绑定，
所以正式运行会用验收文档登记的可绑定端口。

变量缺失时用例 `skip`，理由写明「未提供 DSH 实例」「未提供浏览器驱动」或
「未提供证据目录」——**`skip` 不等于通过**。运行端到端层请使用独立 profile 与独立端口，
不要复用正在使用的实例；指向 live 端口 `3081` 时脚本会直接拒绝运行（除非显式设置
`SIDE_QUOTE_E2E_ALLOW_LIVE=1`），因为 `E-08` 会真的停用插件。

端到端层的操作前提（脚本不自行创建）：

- 实例工作区内需有夹具：`notes/a.md`（含 `quick brown fox`、`second bullet item`）、
  `notes/b.md`（含 `different document body`）、`notes/secret.md`（含 `DEMO_SECRET=placeholder`，
  敏感名 + 可引用格式）、`notes/server.pem`，以及 `samples/` 下的
  `report.pdf`、`image.png`、`table.xlsx`、`doc.docx`、`page.html`。
- 名为 `.env` 的夹具在 Files 页属隐藏项，脚本无法列出；`.env` 的引用与警示只由单元层
  （U-10/U-11）覆盖，浏览器层用 `notes/secret.md` 走同一条「原样插入 + 一条 info」路径。
- 首次加载会弹出预览版说明对话框，它带全屏遮罩并会吞掉所有真实鼠标事件。脚本在
  `waitForAppShell` 里、页面加载之后与文件导航之前关闭它；否则按钮只能被 DOM 激活，
  真实指针点击不可达。
- 每张截图旁会写一个同名 `.json` sidecar，记录 Git revision、实例地址与端口、profile、
  视口（1440×900）与用例编号。

## 已知取舍（已记录，不修好）

1. **同一会话内同一文件自第二次引用起只给路径指针**，不再重复贴原文；想再贴原文需引用另一个
   文件，或重启插件（记录在插件内存里）。
2. **跨预览体的选区不可引用**：选区起点与终点必须落在同一预览体内，否则按钮置灰。
3. **敏感判断只看文件名**，不做内容特征检测：普通 `.txt` 里抄写的密钥不会被警示。
4. **引用会把文件内容与工作区相对路径送入会话并发送给模型**；对含密钥的文件请自行判断。
5. **HTML 预览不支持引用**：由 `I001-F02` 的接管式渲染器承担，且默认关闭。
6. **手写 bundle 与本版 DSH 客户端接口强耦合**：升级到新 rc 后必须重跑单元层与端到端层，
   回归责任在本项目，不在 DSH。
7. **截断阈值固定为 200 行 / 8000 字符**，不可配置。
8. **没有屏幕会话或没有保留的会话作用域时，按钮直接置灰**：这两种状态下不存在会话绑定的
   通知通道，插件既无法插入也无法告知失败，因此不把"可点但必然失败"暴露给用户。竞态下真的
   点到时仍走一次失败分支，但那条通知没有通道可投递，用户不会看到提示。

## 实现取舍（本轮新增）

1. **平台 `insertQuote` 成功后会自己把键盘焦点移回输入框**（`preventScroll: true`）。
   插件自身从不移动焦点、不滚动、不清除选区；「不抢焦点」的可实现范围到此为止。
2. **`focusedTarget(element)` 解析非焦点元素属于「实现能力大于已发布文档措辞」**：文档只承诺
   返回「拥有当前 DOM 焦点的侧栏页目标」，实际实现按元素祖先解析任意 tab body 内的元素。
   这是 DSH 升级时的回归重点；若某版本收紧该行为，按钮会一律置灰而不是插错文件。
3. **零构建 bundle 在 factory 结果上暴露 `internals`**，让 `node:test` 能直接测到纯逻辑与状态
   逻辑。这是**仅测试可见**的面，不是公开 API，也不承诺向后兼容。
