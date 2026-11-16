# I001-F02 实施计划

## 计划信息

- Feature：`I001-F02` HTML 预览接管适配（默认关闭、显式开启）
- 计划修订：`1`
- 计划深度：`expanded`
- 深度理由：单一 owner（`core`）但跨五处高风险面——官方扩展点注册与注销时序、不透明 origin
  iframe 桥与父侧校验、平台脚本闸门状态机、F01 适配器接缝的归属判定扩展、真实浏览器端到端
  证据与安全边界（`sandbox`、无宿主对象外泄）。影响不清楚的部分不得按低风险假设推进。
- 调研基线：工作仓库 `D:\dsh-side-quote`，`main` @ `cc66d90`（F02 讨论、领域文档与 profiles
  尚未提交）；代码基线为 F01 已闭环实现 `code/client.js`（931 行）与 `code/test/**`；
  运行基线为本机 DSH `0.2.2-rc.3`（源码 checkout 只读，live 实例 `3081` 只读、不动）。
- 计划批准：主编排者（本 session）在首个实现编辑前确认；不是额外的用户审批。
- 并行：`sequential`（workbench `## Parallel development`）；不开 worktree。计划内部允许
  P1 与 P2 两条**文件范围不重叠**的 item 并行（见 §3）。

## 1. 目标和边界

- 目标：`.html` / `.htm` 预览头部出现接管开关（默认关闭，`localStorage`
  `dsh-side-quote:html-takeover='on'`）；接管生效（持久开关为开 且
  `configForms.developerTools.enabled` 为真）时由本插件渲染预览，用户可在预览内划词、用头部
  引用按钮把渲染文本作为引用块插入当前会话输入框；闸门变假立即回落自带实现且持久开关保持为开。
- 权威需求/领域文档：
  - `core/implementation.md`（§3 注册形状、§4 闸门真值表、§5 桥与校验、§6 接缝与判定顺序、
    §7 头部控件、§8 生命周期、§9 降级）
  - `core/quote-content-contract.md`（§1 渲染文本保真、§2–§8 沿用 F01、§10 白名单关系）
  - `core/testing-and-acceptance.md`（§2 U-20…U-31、§3 E-10…E-18、§6 AC-17…AC-30、
    §7 派生义务、§8 README 九条取舍）
  - 上游权威：`feat-i001-f01-text-preview-quote/core/{implementation,quote-content-contract,testing-and-acceptance}.md`
    （接缝、模板、截断、路径、敏感名、记录、`summary`；冲突以 F01 为准）
  - `feasibility/confirmed-constraints.md` §1 第 2/3/6/7 条、§4 负向影响
- 明确不做：相对资源读取/打包（D-01 已决策关闭）；嵌套 iframe / 画布 / `user-select:none`
  页面文字；内容特征级敏感检测（D-04）；跨预览体选区（D-05）；全量「会话已读」判定（D-03）；
  桥消息令牌或白名单文本校核；任何构建链、JSX/TS 源文件或运行时依赖；修改/替换/卸载自带
  插件包；修改输入框组件。
- 行为影响：
  - 新增：HTML 预览头部接管开关（默认关闭）、接管渲染与引用按钮变体、iframe 桥、开启自检与
    降级通知、中英新增文案。
  - 保留：接管关闭时 HTML 预览仍由自带实现渲染（正文区域与插件停用逐像素一致，见
    `core/implementation.md` §9 与 C-03 口径）；`ALLOWED_SUFFIXES` / `ALLOWED_FILENAMES` /
    文本适配器 / 文本引用按钮 / 模板 / 截断 / 指针块 / 敏感名 / `summary` / 已引用记录不变。
  - 移除/降级：接管开启时外部 CSS/JS/图片不加载（C-14，新能力的显式边界）；手动切回自带
    渲染器时引用按钮恒置灰（C-21）。二者不得被"修好"或记为缺陷。
- 跨会话接手的不可变约束（正式出处）：`feasibility/confirmed-constraints.md` §1 第 3 条
  （只经官方扩展点，自带包不改）与第 7 条（隔离取证、不重启/终止 `3081`、实验代码不进 live
  profile）；§2 第 1 条（自带 HTML iframe 为不透明 origin `sandbox="allow-scripts"`，不能靠它
  读选区）；`code/package.json` 零依赖与 `files` 不含 `test`。

## 2. 调研结论和未决项

### 2.1 已核对的代码事实（路径 → 对实现的影响）

- `code/client.js`（931 行）→ 顶部常量区 25–59；`createAdapterRegistry()` 263（重复 `id`
  抛错 283–285，返回幂等注销 287–293）；`createQuoteActions(deps)` 476，其中
  `resolveTargets(element, sessionId)` 512–527 是**三元素归属**，`stateOf` 544 与 `click` 582
  调用 `readSelection({ path, document, anchor })`（**无 `tab`**）；`createQuoteButtonComponent`
  762（白名单外 `return null` 786，`mousedown` `preventDefault` 794–796）；`applyPlugin(ctx, host)`
  812 只取 `host.document`；effect 登记顺序 836–870，Cordis disposer **逆序执行**（LIFO）；
  `internals` 879–917；工厂 `inject` 924 恰为 6 项。
- `code/test/load-client.mjs` 32–55 → 用 `new Function('window', src)` 执行 bundle，只伪造
  `__ModuleLoader__`；`require` 表可注入任意模块。**不能**注入 `document`/`localStorage`/`URL`
  ——它们经 `applyPlugin(ctx, host)` 或全局进入，因此新逻辑必须以工厂 + 显式依赖注入的形态暴露，
  才能被单元测试驱动。
- `code/test/quote-state.test.mjs` 364–454 → fake `ctx` 为测试自建（缺
  `documentPreviews`/`configForms`/`window`/`localStorage`/`URL`）；`createQuoteActions` 已全注入式
  （106–139）；`createManualTimers` 23–47 可复用于 4000ms 超时；`notifications` 136–138 可复用
  于通知预算。
- `code/test/e2e/cdp.mjs` → `openPage` 296（`evaluate/waitFor/mouseClick/screenshot/consoleErrors`）、
  `connectCdp` 191（`send(method, params, sessionId)` 已支持子 session）、`selectPhrase` 620
  （父文档合成 Range）、`readQuoteButton` 556、`readNotices`/`waitForNotices` 677/696、
  `disablePlugin` 807、`screenshot` 385–407（**全视口，无 `clip`**）、sidecar 396–403
  （无接管状态/驱动方式/sandbox 字段）。`formats.test.mjs` 58 与 74 是 `.html` 断言的唯一落点。
- `code/test/module-shape.test.mjs` 48–63 断言工厂 `inject` 恰为 6 项 → 本 Feature 必须同批更新。
- 平台（DSH `0.2.2-rc.3` 源码，只读）：
  - `documentPreviews.register(def) → disposer`，**重复 `id` 抛错**（`document/registry.ts:99-118`），
    缺省 `priority:'extension'`（`:21`），排序 `rank 降序 → 最长后缀匹配 → 注册顺序`（`:47-53`），
    `id` 同时是正文 keyed slot key，`loading:'bytes-complete'` 交付 `{ kind:'bytes', data: Uint8Array }`，
    `wrap` 只影响工具栏换行开关，正文缺失时渲染 `rendererUnavailable`。
  - 自带 HTML 实现：id `@deepseek-ai/dsh-client-ui-sidebar-documentpreview/html`，
    `extensions:['html','htm']`、`priority:'builtin'`、`loading:'bytes-complete'`、`wrap:false`；
    交互模式 iframe 为 `blob:` + `sandbox="allow-scripts"` + `data-html-preview`，静态模式为
    `srcDoc` + `sandbox=""` + 同标记，闸门假时走静态模式。
  - `configForms.developerTools.enabled` 是 `ObservableSnapshot<boolean>`（`getSnapshot/subscribe`），
    未收到值默认 `false`（fail-closed），schema 默认 `true`，Host 命名空间 `ui-settings`。
  - 位点：`sidebar.right.tab.document.actions` owner props **仅** `{ absolutePath }`；
    `sidebar.right.tab.document` 正文 props 为 `resourceAddress/content/wrap/scrollportRef/
    addResource/setResources`（**无 `absolutePath`**，路径只能来自按钮位点）。
  - `focusedTarget(element)` 按祖先 `closest` 解析（`focus.ts:30-46`），返回
    `{ sessionId, paneId, host, tabId, occurrence, navigationRevision }`，未提交 tab 会抛错。
  - Cordis 的 `inject` 只有数组或映射两种形态，**无 `{ required, optional }`** → 注入即硬依赖。

### 2.2 调研发现与处置（本计划新增的裁决，均不改变已确认契约）

1. **`resolveTargets` 必须重构**：现实现对 `anchorElement === null` 直接 `return null`（置灰），
   而 HTML 场景父文档没有选区。处置：把"父文档三元素校验"降为无 `witness` 分支，`anchor`/`end`
   允许为 `null`，有 `witness` 时改用 `focusedTarget(witness)`；两分支仍是接缝的声明式差异，
   核心不出现按扩展名/格式的 `if`（`core/implementation.md` §6.2 已规定）。
2. **`register` 不幂等**：重复 `id` 抛错。处置：幂等由本插件保证（单一 `ctx.effect` 总组 +
   目标状态比较，状态未变不重复注册），文档 §3"注册与注销必须幂等"指插件行为，不指平台服务。
3. **工厂 `inject` 变化**：新增 `documentPreviews`、`configForms` 为**必需**注入
   （Cordis 无可选注入）。风险：若某 profile 缺 `configForms`，插件整体不激活（F01 能力回退）。
   处置：`documentPreviews` 由已在 manifest `dsh.client.inject` 的
   `dsh-client-ui-sidebar-documentpreview` 提供，确定性高；`configForms` 由
   `dsh-client-ui-settings` 的 `ConfigForms` 服务提供。以检查点 C1 的实例冒烟证明插件仍激活；
   若不激活，按 §6 停止并改用惰性读取该服务（fail-closed）后重新批准受影响 item。
4. **keyed 跨包 `slots.register` 无本仓库先例**：平台侧同形用法见自带 html 实现
   （`html/index.ts:31-42`）。处置：把它作为 P1 的首个冒烟项（C1），失败即停止而不是绕开。
5. **E-10 像素等价的前提**：自带 HTML 正文在闸门真/假时是两种变体（`blob:`+`allow-scripts`
   对 `srcDoc`+`sandbox=""`）。处置：E-10 的两阶段（插件启用+接管关 / 插件停用）必须在**同一
   实例、同一闸门状态**下截图，并断言两阶段的 `data-html-preview` iframe 的 `sandbox` 属性
   **彼此相等**（不硬编码具体值），同时把观察到的 `sandbox` 写入 sidecar。这样"与自带一致"
   与"确为自带实现"都可判定，且不引入新的产品口径。
6. **`cdp.mjs` 头注释"不使用自带插件 data 属性"与 E-10 冲突**：处置：该禁令仍约束**产品代码**
   （生产逻辑不得读 `data-*` 判断归属或格式），但允许 E-10 的基线断言读取
   `data-html-preview`；在 `cdp.mjs`/用例注释里写明这条边界，评审按此判定。
7. **正文组件拿不到路径**：处置：路径只从 `sidebar.right.tab.document.actions` 的
   `absolutePath` 取得；正文只管渲染与桥，不参与来源路径。
8. **桥失败通知的落点**：正文组件没有会话作用域。处置：由桥在 4000ms 超时/`error` 时回调
   `reportFailure(reason, frame)`，实现侧用 `sidebarRight.focusedTarget(frame)` 求页目标、
   `mounted` + `sessions.scope()` + `conversation.input.for()` 投递，按「原因 + 页目标 id」去重
   （解析不到时以 frame 身份为键）；无作用域时静默（与 F01 §8.1 同一边界），不新增通知位点。
9. **HTML 适配器取哪个 iframe**：处置：适配器持有桥的 frame 列表与 `sidebarRight` 依赖，优先
   返回 `focusedTarget(frame).occurrence.id === target.tab.occurrenceId` 且有非空文本的 frame；
   仅有一个候选时取它；无法消歧时返回 `null`（置灰）。归属的最终裁定仍在核心的 witness 分支。
10. **`applyPlugin(ctx, host)` 需要可测注入面**：处置：`host` 增加 `window`、`storage`、`url`
    （缺省回退到 `globalThis`/`localStorage`/`URL`），仅用于桥监听、持久化与 blob 生命周期，
    不改变宿主行为；`internals` 同步暴露 `createHtmlBridge`/`createHtmlTakeover`/
    `createHtmlQuoteAdapter`/新增常量与 locale，供 `node:test` 直接驱动（零构建下唯一可测途径，
    沿用 F01 的 `internals` 面并注明"仅测试可见"）。

### 2.3 权威/契约来源与冲突检查

`wiki/00-spec.md`、`02-file-authority-map.md`、`03-current-decisions.md`、`governance/workflow-profile.md`、
`code-ai/project-facts.md`、`wiki/validation/README.md` 已核对，无语义冲突。已确认的唯一契约变更
（F01 E-04 `.html` 断言改写）见 `core/testing-and-acceptance.md` §6 末段与 §7 第 3 条，本计划 P2
同批执行；F01 的 U-10 与 AC-15 不变。

### 2.4 假设及验证方式

- 假设 A1：跨不透明 origin 的父侧 `message` 能收到 `event.origin === 'null'` 且
  `event.source === frame.contentWindow`。验证：P3 单元用例 + E-12 实测；失败按 §6 停止。
- 假设 A2：`document.open()/write()` 之前装好的 `window` 级监听在之后仍有效。验证：E-12；失败
  则改注入点（`document.open()` 之后立即重装）并先回写文档。
- 假设 A3：`focusedTarget(iframeElement)` 能解析到 tab occurrence。验证：E-12 归属分支；失败则
  按钮恒置灰 → 按 §6 停止并回到 workbench，不得自造归属。
- 假设 A4：`configForms` 注入后插件仍能激活。验证：C1 冒烟。

### 2.5 阻塞决策

无。上述 2.2 的 10 项均属实现层裁决，不改变已验证的产品结论、契约条款或验收标准。

### 2.6 运行准备（复用既有入口，不重建环境）

- 端到端实例：临时 `DSH_HOME`（`%TEMP%\side-quote-f02\e2e\dsh-home`）+ profile
  `side-quote-verify`（由自带 web 模板新建）+ 端口 `34181`（`3181` 落在 Windows 保留段
  3119–3218，替换原因写入证据）+ `--no-open`。`3081` 全程只读。
- 浏览器：本机 Edge/Chromium，独立 `--user-data-dir` 与 `--remote-debugging-port`，视口
  `1440x900`、`deviceScaleFactor: 1`；测试侧只用 Node 24 内建 `fetch`/`WebSocket`。
- 夹具：实例工作区 `samples/page.html`、`samples/page-csp.html`、`samples/page-assets.html` +
  `samples/extra.{css,js,png}`；全部合成、运行后删除；仓库内不得出现名为 `.env` 的文件。
- 准备责任与清理责任：编排者（本 session）；验证角色只读使用并按记录回收。
- 复用：F01 的 `code/test/e2e/cdp.mjs` 与 `SIDE_QUOTE_E2E_*` 变量（不重建 harness）。

## 3. 执行顺序

| Item | Owner | 预期改动文件/范围 | 前置依赖 | 预期结果与验收 | 本步验证 |
| --- | --- | --- | --- | --- | --- |
| P1 | `core` | `code/client.js`（常量、locale 新增键、`internals` 暴露面）、`code/test/module-shape.test.mjs`（`inject` 8 项）、`code/package.json` 不变 | 无 | 常量与字典键齐全（U-31 转绿）；`inject` 含 `documentPreviews`/`configForms`；`node --check` 通过 | `node --test "code/test/**/*.test.mjs"` + `node --check code/client.js` |
| P2 | `core` | `code/test/e2e/cdp.mjs`（新增子 frame 拖选/脚本选区、`clip` 截图裁剪、`localStorage` 预置、通知计数、sidecar 新字段）、`code/test/e2e/html-takeover.test.mjs`（新，E-10…E-18 骨架）、`code/test/e2e/formats.test.mjs`（`.html` 断言改写） | 无（只依赖 §2 的稳定契约：`data-side-quote-html*` 标记、`SIDE_QUOTE_E2E_*` 变量） | E-10…E-18 可执行；缺 env 时 `skip` 且理由明确；`.html` 改为"无引用按钮 + 有接管开关" | `node --test "code/test/e2e/**/*.test.mjs"`（缺 env 记未执行） |
| P3 | `core` | `code/client.js`（接缝：`target.tab`、`Capture.witness`、`resolveTargets` 重构、`stateOf`/`click` 传参与归属分支）、`code/test/quote-state.test.mjs`（U-21、U-22；U-19 护栏） | P1 | 无 witness 分支逐字等价 F01（U-12…U-19 全绿）；有 witness 分支按 occurrence 相等；`focusedTarget` 抛错/空 → 置灰 | `node --test` + `node --check` |
| P4 | `core` | `code/client.js`（`createHtmlBridge`：bootstrap 构造、报文校验、按 iframe 状态、4000ms 超时、卸载清理；`createHtmlTakeover`：持久化 fail-closed、闸门订阅、注册/注销总组、开关与引用按钮组件、自检与降级通知、去重表）、`code/test/html-bridge.test.mjs`（新，U-23…U-25）、`code/test/html-takeover.test.mjs`（新，U-26…U-30、U-20 复核） | P3 | U-20…U-30 转绿；`sandbox` 只含 `allow-scripts`；无 `allow-same-origin` 字样；`ctx.effect` 单组登记、异常回滚 | `node --test` + `node --check` |
| P5 | `core` | `code/client.js`（`applyPlugin` 接线：`host.window/storage/url`、`internals` 补齐、接管组插入 860–863 之间）、`code/test/module-shape.test.mjs` 复核 | P4 | 接线不改 F01 行为；装→开→关→卸 全部归零（U-28）；`node --check` 通过 | `node --test` + `node --check` |
| P6 | `core` | `code/README.md`（§8 九条已知取舍 + 桥信任边界表述）、`wiki/code-ai/project-facts.md` §5（HTML 接管层与子 frame 驱动说明；若新增 env 变量同批补 §4） | P1、P2 | 两处派生文档与实现同批完成；`来源：`/`已引用过`/截断说明不出现在字典 | 人工核对 + `node --test`（U-31） |
| C1 | 编排者 | 实例冒烟（只读）：插件在 `side-quote-verify` 实例上仍激活、keyed 正文位点被接受、`.html` 头部出现开关 | P5 | 插件激活且开关可见；控制台无 error | E-10/E-11 的首次真实运行 |
| P7 | 编排者 | 静态检查 + 单元层全量 | P1–P6 | `node --check` ×2 exit 0；单元层 pass、e2e 因缺变量 skip 并记为未执行 | 命令表 `lint` / `test` |
| P8 | 评审（固定 `wiki/code-ai/review-agent.md`） | 评审报告 `evidence/review-gate-record.md` | P7 | 无 Blocker/High，或已修复并复审 | 评审门 |
| P9 | 验证（独立 session） | `evidence/verification-record.md`、`evidence/e2e/**`、`evidence/manual/**` | P8 | AC-17…AC-30 逐项判定；E-10…E-18 实测；人工回归逐项留档 | 命令表 `e2e` + 截图 sidecar |
| P10 | 编排者 | `feature.yaml` 生命周期转换 + `factory gate workspace` | P9 | `acceptance/completed` → `ready-to-merge/ready`，gate 通过 | 状态机 + gate |

- 每个 item 的范围足够小、可单独检查；计划外文件不得顺手修改。
- 未满足依赖的 item 不启动。P1 与 P2 文件范围不重叠（`client.js`/单元 vs `e2e/`），可并行；
  其余顺序执行。
- 角色分离：P8 由固定评审 profile 执行，P9 由独立验证 session 执行；实现者不自我验收。

## 4. 条件风险与证据

| 影响面 | 适用？ | 影响、证据或不适用理由 |
| --- | --- | --- |
| API、共享契约、schema/state | 是 | 新增 `documentPreviews`、`configForms` 两个客户端服务依赖与两个头部位点；`readSelection` 的 `target` 增加 `tab`、`Capture` 增加可选 `witness`（F01 未发布 API，本仓库唯一消费者）。契约出处见 §1、§2。 |
| 持久化、迁移、兼容性 | 是（轻） | 新增浏览器 `localStorage` 键 `dsh-side-quote:html-takeover`（值 `'on'`），缺失/非法/不可写一律关闭；无迁移、无 Host 侧配置面、不写 profile。 |
| 安全、权限或敏感数据 | 是 | 不透明 origin + 只 `allow-scripts`；父侧四重校验；桥单向上报；页面可得文本但拿不到任何宿主对象。路径（`local-machine-paths`）与内容（`credentials`）进入会话正文，规则以 F01 内容契约 §5–§6 为准。证据与夹具只用占位值，不得出现真实机密或含 token 的启动地址。 |
| 视觉/交互 | 是 | 开关存在/状态/禁用原因、引用按钮可用与置灰、正文接管切换、通知条数与层级；证据须绑定 Git revision、实例 origin+端口、profile、视口 1440×900、用例编号、接管状态、选区驱动方式与观察到的 `sandbox`。 |
| 跨 owner、模块或系统边界 | 否 | owner 表只有 `core`；外部面只读（`documentPreviews`/`configForms`/`slots`/`sidebarRight`/`sessions`/`conversation`/`locale`/`timer`）。 |

前序证据复用：F01 的 `evidence/verification-record.md`（AC-1…AC-16 通过）与
`evidence/format-regression/` 是本 Feature 的**基线**，只用于"未破坏既有行为"的对照，不证明
任何 HTML 接管行为；E-04 的 `.html` 断言按本 Feature 显式契约变更改写，旧结论在该格失效、其余
格式的既有截图结论保持有效。E-10…E-18 与 AC-17…AC-30 只能由 P9 的新执行产生。

## 5. 集成与检查点

| Checkpoint | 触发时机 | 需要的证据 | 通过后继续做什么 |
| --- | --- | --- | --- |
| C1 平台面冒烟 | P5 完成、首次在实例上加载 | 插件仍激活（F01 按钮仍在 `.md` 上出现）、`.html` 头部出现 `data-side-quote-html-toggle`、keyed 正文位点被接受、控制台无 error | 进入 P7；失败按 §6 停止 |
| C2 单元层与文档同批 | P7 | 两条 `node --check` exit 0、单元层全绿（含 U-20…U-31）、README 九条与 project-facts §5 已改 | 交评审门 P8 |
| C3 评审通过 | P8 | 无 Blocker/High，或已修复并复审；文档同步结论为通过 | 启 P9 独立验收 |
| C4 验收通过 | P9 | AC-17…AC-30 逐项可判定；E-10…E-18 实测且驱动方式写明；人工回归逐项留下结论 | P10 生命周期转换 |
| C5 闭环 | P10 | `acceptance.passed: true` + `closure.validation_evidence` 实际文件；`ready-to-merge/ready` 记录且 gate 通过 | 最终交接 |

单模型单 agent 的有界 item 不额外制造逐步 handoff；只在 C1–C5 核对。

## 6. 停止与重规划条件

- 目标、验收、用户可见行为或允许文件范围需要扩大。
- 发现未被确认的 API、schema/state、数据迁移、权限/安全或共享契约变化。
- C1 失败：keyed 跨包正文位点不被接受，或 `configForms` 注入导致插件不激活 → 停止 P1/P5 的
  受影响部分，改用惰性读取 + fail-closed 并重新批准受影响 item；不得为了跑通而删掉闸门。
- 假设 A1/A2/A3 任一失败（`event.origin` 非 `'null'`、`document.open()` 后监听失效、
  `focusedTarget(iframe)` 解析不到）→ 停止 P4/P5 受影响部分，只补受影响路径；A3 失败时 HTML
  按钮只能恒置灰，属能力缺失，必须回到 workbench 裁决，不得自造归属。
- 端到端实例无法在不动 `3081` 的前提下建立 → 停止 P9 的浏览器部分，AC-17/AC-19/AC-25/AC-27/
  AC-28 记 `not verified` 并如实上报，不以单元层结论替代。
- 证据来源缺失、重建或切换时，记录原因、旧新来源与受影响项；受影响项按本计划修订重评。

## 7. 回滚和遗留风险

- 回滚方式：全部改动落在 `code/`（`client.js`、`test/**`、`README.md`）与
  `wiki/code-ai/project-facts.md` §5；`git revert` 对应提交即回到 F01 闭环状态。接管关闭态不
  注册任何项，用户侧回滚等价于把 `localStorage` 键删除。`side-quote-verify` 的插件安装用
  `dsh plugin --profile side-quote-verify remove dsh-side-quote` 回收；`3081` 与 live profile
  全程无写入。
- 已知残余风险（负责人 `core`）：
  1. 页面脚本与桥同 realm，可伪造选区上报（无令牌），属已确认信任边界，写入 README。
  2. 接管开启后不继承自带的外部资源打包与交互预览能力，差距随 DSH 升级扩大。
  3. 手动切回自带渲染器时引用按钮恒置灰（位点拿不到本 tab 选中的实现）。
  4. 手写 bundle 与 `0.2.2-rc.3` 客户端接口强耦合，升级到新 rc 后必须重跑单元层与端到端层。
  5. `focusedTarget(iframeElement)` 的非焦点用法属"实现能力 > 文档承诺"，DSH 收紧时表现为置灰
     而非插错文件。

## 计划修订记录

| 修订 | 日期 | 改动原因 | 受影响 items | 批准 |
| --- | --- | --- | --- | --- |
| 1 | 2026-11-16 | 初版：基于 F02 领域文档、F01 代码基线与 `0.2.2-rc.3` 平台取证建立；纳入 10 项实现层裁决（§2.2） | 全部 | 主编排者 |
