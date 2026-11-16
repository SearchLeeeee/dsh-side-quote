# I001-F02 HTML 预览接管适配 讨论工作台

## File role

结论型工作台：只记录问题清单、已确认结论、未决问题、领域分类、文档目标与 profile
目标。它不是聊天记录，也不是最终权威文档。合并后长期 Wiki 是唯一现行权威，本文件
降级为非权威历史。

## Feature summary

通过官方扩展点接管 `.html` / `.htm` 的右侧栏预览渲染，让用户在接管后的预览里划词，
用头部「引用」按钮把选中文字组装成带来源路径的引用块插入当前会话输入框。接管默认
关闭、只在用户显式开启时生效；未开启时 HTML 预览仍由自带实现渲染。iframe 保持不透明
origin 与最小权限，桥只单向传递选区文本。接管不继承自带预览的外部资源加载能力，该
差距以开关说明、首次通知与插件 README 三处一致呈现。

## Domain classification

- Primary domain: `core`
- Supporting domains: 无（本项目 owner 表只有 `core` 一个责任域）
- Rationale: 全部可执行内容落在 `code/`，由 `core` 独占；无跨 owner 契约边界。

## Discussion mode

- selected: interactive
- source: 继承 F01 workbench `## Discussion mode`（同一 Initiative 的既有正式记录），
  本轮未重新询问
- recorded at: 本轮首个提问前

## Parallel development

- selected: sequential
- parallel features considered: I001-F01（`ready-to-merge / ready`，已闭环，无剩余开发
  工作）；I001 下无其它 Leaf，本 Feature 是 F01 的唯一后继
- source: 用户本轮指令明确指定 `sequential`
- recorded at: 本轮首个提问前

## Discussion rules

- 交互式：一次一题，按实现影响从大到小推进。
- 每题携带背景、一个中立问题、待检验的假设或证据、实现影响；只在存在真实选择时给选项。
- 结论只在用户明确回答后记录；推荐与沉默都不算确认。
- 最后一轮用户对剩余问题给出显式授权（「剩下的都按照建议来」），据此记录 Q-10…Q-12
  为已确认结论，并在离开讨论前逐条列出其内容。
- 测试用例与验收标准在离开讨论前显式确认。

## Known constraints

来自可行性阶段与本轮实机核实，本轮按约束执行、不再重新论证：

1. 接管只能经官方扩展点（`ctx.documentPreviews` + `sidebar.right.tab.document` 位点），
   自带插件包不改、不替换、不卸载。
2. 默认关闭；未显式开启时 HTML 预览行为与自带一致，且差异可逆。
3. 依赖自带 HTML 预览 iframe 读取选区不可行：它是不透明 origin 的
   `sandbox="allow-scripts"` 框架，父页面无法访问其文档与选区。
4. 零构建：手写已构建 bundle（纯 JS、无 JSX/TS），React 经 `require()` 从平台模块表
   解析；`dependencies` 保持为空。
5. 复用 F01 的适配器接缝与"只加适配器、不改核心流程"的可证性目标；内容契约沿用 F01
   （摘录保真、空行 + `来源：<工作区相对路径>`、200 行 / 8000 字符先到先截、指针块、
   敏感名只警示不拦截、一次操作最多一条通知）。
6. 不重启、不终止用户 live 的 `dsh web`（3081）；不写业务项目目录；实验代码不进入
   live profile；端到端取证在临时 `DSH_HOME` + profile `side-quote-verify` + 端口
   `34181` + 独立 Edge CDP 进行（F01 已实测 3181 落在 Windows 保留区间 3119–3218）。
7. 路径与内容进入 `local-machine-paths` 与 `credentials` 两个敏感类别，规则以 F01
   内容契约 §5–§6 为准。
8. 本机 DSH `0.2.2-rc.3`：`documentPreviews` 外部实现（缺省 `priority: 'extension'`）
   排在自带 `builtin` 之前；正文必须以同一 `id` 注册进 `sidebar.right.tab.document`，
   `loading: 'bytes-complete'` 交付 `{ kind: 'bytes', data }`。
9. HTML 预览今天已带"打开方式"菜单（自带 HTML + 纯文本回退两个候选），新增候选不会
   新造菜单，只多一条条目。
10. 自带 HTML 正文的脚本执行由 Host 偏好 `ui-settings.developerTools.enabled` 决定，
    schema 默认 `true`，值未到达时读 `false`（fail-closed）。

## Confirmed conclusions

### 开关与零差异（Q-01、Q-02、Q-09）

- **C-01** 开关入口是预览头部工具栏（`sidebar.right.tab.document.actions`），只对
  `.html` / `.htm` 出现；不使用设置页偏好行，不做双入口。
- **C-02** 默认关闭。开关状态持久化在浏览器 `localStorage`
  （键 `dsh-side-quote:html-takeover`，值 `'on'` 表示开启）；缺失、非法值或存储不可用
  一律视为关闭（fail-closed），且不得影响其它功能。不引入 Host 侧配置面。
- **C-03** "关闭＝与自带一致"的可证口径是双断言：(a) 预览正文区域与未安装插件的实例
  逐像素一致（裁剪到 `sidebar.right.tab.document` 区域对比）；(b) 正文仍是自带实现
  （自带 `data-html-preview` iframe、`sandbox` 属性与自带一致）。头部多出的开关控件是
  入口，不属预览行为差异，文档中按此口径表述，不写"完全一致"。
- **C-04** 接管沿用平台脚本闸门：生效条件为 `持久开关为开 && developerTools.enabled === true`。
  闸门为假或值尚未到达时**不接管**，保持自带静态预览，开关显示为"暂不可用"并说明原因。
- **C-05** 闸门在接管期间变为假时回落到自带实现；持久开关保持为"开"，闸门恢复后自动
  重新接管。不得把用户的开关静默改成关。

### iframe 桥（Q-03、Q-03b、Q-03c）

- **C-06** 单向协议：子文档内以 `selectionchange` / `mouseup` / `keyup` 上报选区，父页面
  只接收、不向 iframe 发送任何宿主信息；父侧按 iframe 缓存最近一次上报，
  `readSelection` 同步读缓存。
- **C-07** 报文形状固定：`{ channel: 'dsh-side-quote/html-bridge', version: 1, kind:
  'ready' | 'selection' | 'error', text?: string }`。父侧只接受同时满足下列条件的报文：
  `event.source === 该 iframe.contentWindow`、`event.origin === 'null'`、`channel` 与
  `version` 完全匹配、`kind` 合法、`text` 为字符串且不超过 65536 字符。其余一律丢弃，
  不得抛错。上限只是传输护栏：内容契约最多保留 8000 字符，故从不改变可观察输出。
- **C-08** 新鲜度口径：HTML 摘录取自桥最近一次上报的选区。点击父页面按钮不改变 iframe
  内的选区，因此该值与点击时刻一致；页面脚本在点击前清空选区而桥尚未上报属可接受的
  极小竞态，写入契约。
- **C-09** 桥预写注入：我方生成的引导文档在 `document.open()` / `document.write()` 之前
  安装 window 级监听，并保存 `Document.prototype.getSelection` 的快照引用（防页面覆盖）。
  不向页面插新 `<script>`，因此桥的可用性不交给页面 `meta` CSP 的 `script-src`。iframe
  用 `blob:` URL 承载而非 `srcDoc`，避免相对资源被解析到 DSH 服务端口。
- **C-10** 信任边界：页面脚本与桥同 realm，**必然可以伪造上报**，消息令牌不可防（同 realm
  可读）。契约明确：桥只上报文本；页面拿不到引用按钮、`insertQuote`、会话作用域或任何
  宿主对象；插入仍需用户在父页面点击，伪造后果限于把同一文件内的文本放进用户自己待
  确认的输入框。

### 归属与接缝（Q-04、Q-05）

- **C-11** 扩展适配器接缝（F01 implementation §5 是指定扩展点）：`readSelection(target)`
  的 `target` 增加按钮自身的页目标解析结果（`sessionId` + `occurrenceId`）；`Capture`
  可选携带 `witness`（本次读取来源的 iframe 元素）。核心规则：无 `witness` 时沿用既有
  三元素校验（文本路径逐字不变，U-19 不变）；有 `witness` 时核心用
  `ctx.sidebarRight.focusedTarget(witness)` 自行解析 occurrence 并要求等于按钮自身
  occurrence，无需父文档选区。改动局限在 `createQuoteActions`。
- **C-12** `ALLOWED_SUFFIXES` / `ALLOWED_FILENAMES` / `isAllowedPath` 与文本引用按钮一字
  不改（U-10 原样通过）。接管生效时额外注册一个 HTML 引用按钮变体（第二个
  `sidebar.right.tab.document.actions` 占用 id，gate 为"接管生效且路径为 `.html`/`.htm`"）；
  开关本身是另一个独立控件。
- **C-13** F01 的 E-04「`.html` 无按钮」作为**显式契约变更**改写：`.html` 在接管关闭时
  仍无引用按钮，但头部有接管开关控件。F01 的 U-10（白名单不含 html/htm）与 AC-15
  （假适配器证明只加适配器）保持不变，并新增结构断言：本 Feature 只新增一个适配器、
  一个正文组件、一个按钮变体。

### 渲染范围与降级（Q-06、Q-07、Q-08）

- **C-14** 不读取任何相对资源：外部 `<link rel=stylesheet>`、`<script src>`、图片一律
  不加载；inline `<style>` 与 inline `<script>` 照常生效。D-01 以"决定不读取"关闭，
  不留 TODO，不新增 `remote.workspaceFiles` 依赖。理由含安全面：自带打包允许相对路径
  上朔，而交互模式 iframe 无 CSP，等于给 HTML 一个读工作区任意文件并外发的出口。
- **C-15** 降级与通知：开启开关时做一次自检并给出一条结果通知（成功 `info`，失败按原因
  各一条 `error`）；运行期只靠按钮可用性与 tooltip 表达（无选区、桥未就绪、页面渲染
  失败）。开启后桥意外失效补一条 `info`，同一页目标最多一条。桥就绪超时阈值 4000ms。
- **C-16** 状态反馈不占用 F01"一次操作最多一条通知"的预算：该预算约束的是点击路径，
  状态通知按"原因 + 页目标"去重且不重复触发。
- **C-17** 内容契约全部沿用 F01（原文块/指针块模板、`来源：` 行、200 行 / 8000 字符
  先到先截、指针降级、敏感名只警示、`summary` 契约），只新增一条：**保真对象是渲染
  文本**——保留空行与块级换行，不保留源码缩进与行内多余空白。

### 差距呈现与生命周期（Q-09、Q-10）

- **C-18** 差距在三处一致呈现：开关 tooltip/说明写"得到：可划词引用"与"失去：外部
  CSS/JS/图片不加载"；首次开启的通知复述一句；`code/README.md` 已知取舍列全。UI 不
  新增常驻提示条或面板。
- **C-19** 缩放不属本 Feature 的差距项：本机核实 HTML 预览没有缩放能力
  （`ZoomViewport` 只用于 image 与 pdf）。继承材料中"不继承缩放"按证据更正。
- **C-20** 开启/关闭路径幂等且顺序对称：开 = 注册定义 → 注册正文 → 注册按钮变体 →
  订阅闸门 → 一条自检通知；关 = 注销按钮 → 注销正文 → 注销定义 → 移除 window
  message 监听 → 清空桥缓存 → iframe 卸载时 revoke blob URL。全部经 `ctx.effect`。
- **C-21** 手动切回自带渲染器（"打开方式"菜单选自带 HTML）时，HTML 引用按钮仍存在但
  恒置灰（该位点 owner props 只有 `absolutePath`，无法得知本 tab 选中的实现）；作为
  已知取舍写入 README。接管注销后 `selected` 自动回落到 `candidates[0]`（自带），不
  留下悬空 renderer。

### 验收（Q-11、Q-12）

- **C-22** 三层验收：单元层（适配器接缝、桥协议校验、降级状态、清理、白名单不变）＋
  端到端层（真实 DSH + 真实鼠标）＋人工回归层（人眼逐项）。任何"已验证"结论都不得只用
  `node --check` / `node --test` 支撑。
- **C-23** 子 frame 选区的驱动力法：优先在 iframe 区域用 CDP `Input.dispatchMouseEvent`
  做真实按压-移动-释放（浏览器按坐标命中 iframe，无需同源）；不稳定时备选
  `Target.setAutoAttach({ flatten: true })` 后在子 frame 执行脚本构造 Range。两者都
  必须在证据中写明实际所用方式，不得把合成 Range 记为物理拖选。
- **C-24** 环境沿用 F01：临时 `DSH_HOME` + profile `side-quote-verify` + 端口 `34181` +
  独立 Edge CDP + 视口 1440×900；不碰 3081；`skip` 不等于通过，缺证据的 AC 记为未执行。
- **C-25** 派生变更义务（实现阶段同批完成）：`code/README.md` 已知取舍条目；
  `wiki/code-ai/project-facts.md` §5 测试分层补 HTML 接管层与子 frame 驱动说明（若新增
  端到端环境变量则同步 §4）；`.factory/factory.yaml` 不新增命令（e2e 命令已存在）。
- **C-26** 明确推迟/不做：相对资源读取（D-01 已决策关闭）、嵌套 iframe 与画布内文字、
  `user-select: none` 页面、内容特征级敏感检测（D-04）、跨预览体选区引用（D-05）、
  全量"会话已读"判定（D-03）。以上均不属本 Feature，实现期不得当作待讨论产品问题重开。

## Behavior change summary

- Added:
  - `.html` / `.htm` 预览头部出现接管开关（默认关闭）。
  - 显式开启且开发者工具闸门为真时，HTML 预览改由本插件渲染，可在预览内划词并引用。
  - 接管自检通知、桥降级提示；中英双语文案扩展。
  - 端到端层新增 HTML 接管用例与人工回归项。
- Preserved:
  - 未开启时 HTML 预览仍由自带实现渲染，正文像素一致（C-03 口径）。
  - 自带插件包不被修改、替换或卸载；`ALLOWED_SUFFIXES` / 文本引用按钮 / 文本适配器不变。
  - 输入框编辑器行为、已引用记录、内容模板、截断与敏感名规则不变。
- Removed or degraded:
  - 接管开启时外部 CSS/JS/图片不加载（新能力内的显式边界，不是既有能力退化）。
  - 手动切回自带渲染器时 HTML 引用按钮恒置灰。
- High-impact removals confirmed individually: 不适用（无既有能力被移除）；接管开启后的
  资源不加载属新能力的显式边界，已由 C-14 与 C-18 单独确认。

## Authority consistency check

按 [文件权威地图](../../../../../../02-file-authority-map.md) 核对与本 Feature 相关的现行权威：

| 权威文档 | 核对结论 |
| --- | --- |
| [03-current-decisions.md](../../../../../../03-current-decisions.md) | 无冲突；本 Feature 不改变任何现行决策条目 |
| [code-ai/project-facts.md](../../../../../../code-ai/project-facts.md) | "零构建、零运行时依赖"成立（桥不引入依赖）；§5 测试分层须在实现阶段补 HTML 接管层 |
| [governance/workflow-profile.md](../../../../../../governance/workflow-profile.md) | 一致；e2e 命令已登记，无需新增命令 |
| `product/product-vision.md`、`implementation/frontend/`、`testing/` | 尚未创建（权威地图中为占位路径），无冲突面 |

语义冲突：无。长期权威在合并阶段统一承接，不提前创建。

## Visual and interaction acceptance

- In scope: yes
- 要求：在独立实例、固定路由（右侧栏打开目标 `.html`）、固定视口 1440×900 下断言
  开关存在与状态、引用按钮可用/置灰、插入内容与来源路径、通知条数与层级；截图证据
  绑定 Git revision、实例端口、profile、视口与用例编号，落在
  `wiki/feature-workspace/.../feat-i001-f02-html-preview-takeover/evidence/`。
- 人眼回归：同一 `.html` 在自带与接管下各截一次图，逐张确认文字可读可选，并逐条记录
  外部资源未加载的表现。

## Question inventory

| ID | Domain | Question | Why it matters | Status |
| --- | --- | --- | --- | --- |
| Q-01 | 交互/验收 | 开关入口位置与零差异可证口径 | 决定验收证据形式与 D-02 | confirmed → C-01/C-03 |
| Q-02 | 安全 | 是否沿用平台脚本闸门 | 决定是否覆盖用户显式偏好 | confirmed → C-04/C-05 |
| Q-03 | 契约/安全 | 桥协议与选区新鲜度语义 | 跨 origin 下重定义 click-time | confirmed → C-06/C-08 |
| Q-03b | 实现/安全 | 桥代码注入点 | 页面 CSP 是唯一不可控输入 | confirmed → C-09 |
| Q-03c | 安全 | 桥的信任边界 | 伪造面必须显式承认 | confirmed → C-10 |
| Q-04 | 架构 | 归属见证的接缝扩展形状 | 决定"只加适配器"能否成立 | confirmed → C-11 |
| Q-05 | 契约 | 白名单常量与按钮出现条件 | 决定 U-10 是否保留 | confirmed → C-12/C-13 |
| Q-06 | 范围 | 相对资源读取策略（D-01） | 成本与渲染可用性最大杠杆 | confirmed → C-14 |
| Q-07 | 行为 | 降级与通知口径 | 可行性成立条件第 4 条 | confirmed → C-15/C-16 |
| Q-08 | 契约 | HTML 摘录保真口径 | 决定是否新增契约条款 | confirmed → C-17 |
| Q-09 | 交互 | 能力差距呈现位置 | 决定用户预期与 README | confirmed → C-18/C-19 |
| Q-10 | 行为 | 可逆性与资源清理 | "默认关闭且可逆"的证据 | confirmed → C-20/C-21 |
| Q-11 | 验收 | 端到端与人眼验收设计 | 可判定性与隔离取证 | confirmed → C-22/C-23/C-24 |
| Q-12 | 治理 | 派生变更义务与推迟项 | 避免 TODO 式交接 | confirmed → C-25/C-26 |

## Pending questions

无未决问题。

## Deferred out of this Feature

以下刻意推迟或已决策关闭，实现期不得当作待讨论产品问题重新展开：

1. **D-01** 相对资源（CSS/JS/图片）读取 → 已决策不读取（C-14）。
2. **D-03** 覆盖 agent 自身读取行为的全量"会话已读"判定 → 需新 Feature。
3. **D-04** 内容特征级敏感检测 → 未采纳，写入 `code/README.md` 取舍。
4. **D-05** 跨预览体选区引用 → 不支持，沿用 F01 取舍。
5. 嵌套 iframe / 画布 / `user-select: none` 页面内的文字 → 不支持，写入取舍。

## Implementation document targets

- `core/implementation.md` — 接管注册与注销、桥协议与注入、闸门状态机、接缝扩展、
  按钮变体、生命周期与清理、失败与降级路径、可能改动的文件。
- `core/quote-content-contract.md` — 沿用 F01 内容契约的引用方式、HTML 摘录的渲染
  文本条款、来源路径与敏感名的沿用边界。
- `core/testing-and-acceptance.md` — 单元/端到端/人工三层必测用例、验收标准、e2e 环境
  与子 frame 驱动方式、派生变更义务。
- 代码期写入（本阶段只定条目）：`code/README.md` 已知取舍条目。

## Code AI profile targets

- `code-ai/README.md` — profiles 索引与阅读顺序。
- `code-ai/reading-agent-profile.md` — 实现前只读理解。
- `code-ai/core-implementation-agent-profile.md` — `core` 域实现。
- `code-ai/review-agent-profile.md` — 独立评审。
- `code-ai/verification-agent-profile.md` — 分离验收与端到端取证。
