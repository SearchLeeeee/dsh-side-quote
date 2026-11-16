# I001-F01 文本预览划词引用闭环 讨论工作台

## File role

结论型工作台：只记录问题清单、已确认结论、未决问题、领域分类、文档目标与 profile
目标。它不是聊天记录，也不是最终权威文档。合并后长期 Wiki 是唯一现行权威，本文件
降级为非权威历史。

## Feature summary

在 DSH Web 右侧栏的文本类文档预览中，用户划选文字后通过工具条上的「引用」按钮，把
选中文字组装成带工作区相对路径来源的引用块插入当前会话输入框，并以通知反馈失败与
敏感内容警示。零构建、零运行时依赖，不修改、不替换、不卸载 DSH 自带插件。同一会话
内同一文件第二次起不再重复贴原文，改为插入带重读提示的指针块。HTML 预览不在本
Feature 范围内（由 I001-F02 以默认关闭的接管式渲染器承担）。

## Domain classification

- Primary domain: `core`
- Supporting domains: 无（本项目 owner 表只有 `core` 一个责任域）
- Rationale: 本 Feature 的全部可执行内容都落在 `code/`，由 `core` 独占；不存在跨 owner
  的契约边界，因此不引入额外域。

## Discussion mode

- selected: interactive
- recorded at: 会话内首次提问前（turn 1）

## Parallel development

- selected: sequential
- parallel features considered: I001-F02（`depends_on: [I001-F01]`，依赖未满足，不构成可并行 Leaf）；无其它 Leaf
- recorded at: 会话内首次提问前（turn 1）

## Discussion rules

- 采用交互式：一次一题，按实现影响从大到小推进。
- 每个问题携带背景、一个中立苏格拉底式问题、待检验的假设或证据、实现影响，并在相关
  时说明测试或验收影响；只在存在真实选择时给选项，"推荐"是有条件提案。
- 结论只在用户明确回答后记录；推荐与沉默都不算确认。
- 测试用例与验收标准在离开讨论前显式讨论。
- 已确认结论、提案与未决问题严格区分。

## Known constraints

以下来自可行性阶段，本轮按指令视为约束，不再重新论证：

1. 插入与通知只经 `ctx.conversation.input`（`insertQuote` / `notify`），不接管输入框
   组件。
2. 文本格式的来源归属不得依赖其它插件的内部 DOM 细节，必须走受支持位点。
3. 客户端 bundle 保持手写、纯 JS、无 JSX/TS，React 从平台模块表解析。
4. 监听、定时器、订阅在插件停用时全部释放；重复触发与同选区重入可控。
5. 零构建 = 手写已构建 bundle 格式，不引入构建链，不新增运行时依赖。
6. 不修改/替换/卸载自带插件包；不读取自带 HTML 预览 iframe 内容。
7. 不写业务项目目录；不重启、不终止用户正在使用的 `dsh web`；端到端取证在独立
   profile 与独立端口进行，实验代码不得进入用户 live profile。
8. 引用会把文件内容与来源路径送入会话并发送给模型，命中 `local-machine-paths` 与
   `credentials` 两个敏感类别，必须有显式规则，不得默认"原样全发"。
9. 浏览器行为验收不得降级为"只跑 `node --check` / `node --test`"。
10. 已知取舍写进插件 README，不"修好"。

## Confirmed conclusions

### 触发与可用性

- **C-01** 触发方式是工具条按钮显式确认（`sidebar.right.tab.document.actions` 位点），
  不使用自动插入，不使用快捷键。
- **C-02** 按钮仅在"同一预览体内存在非空选区"时可用，否则置灰。
- **C-03** 350ms 防抖作用于**按钮状态的定稿**（拖选期间不反复切换，停手 350ms 后定稿），
  不作用于点击；点击用"处理中"标记去重。
- **C-04** 选区归属严格限定在同一预览体内：选区起点与终点必须落在同一个预览体，跨预览
  体选区不支持（按钮置灰）。
- **C-05** 插入成功后不清选区、不抢焦点、不滚动页面。

### 引用内容契约

- **C-06** 引用块结构为：摘录在前，空行，末尾一行 `来源：<path>`。
- **C-07** 摘录保真：多行原样保留空行与缩进，不加代码围栏，不重排空白。
- **C-08** 上限为 200 行 / 8000 字符，先到先截；命中截断时在摘录末行后追加一行
  `…（摘录已截断，仅保留前 200 行 / 8000 字符）`。
- **C-09** 路径形式为工作区相对路径；工作区外文件保留原样（绝对或原地址）；Windows
  反斜杠归一为 `/`。
- **C-10** "本会话已读过原文"只认**本插件自身的插入记录**，不扫描会话历史、不推断
  agent 的读取行为。
- **C-11** 已引用记录的粒度为**同文件级**：同一会话内同一路径引用过一次后，后续引用
  一律插入指针块。
- **C-12** 指针块文案为：
  ```
  已引用过：<path>
  原文未重复贴出；需要时请重新读取该文件。
  ```
  只给路径，不猜行号、不给摘录锚点。
- **C-13** 同文件第二次起插入指针块（不拒绝、不询问），用户连续点击不会产生第二条原文块。

### 敏感内容

- **C-14** 敏感文件不拦截：`.env` 类文件仍可引用，内容原样插入。
- **C-15** 敏感判定只看文件名黑名单（单一常量）：`.env`、`.env.*`、`*.pem`、`*.key`、
  `*id_rsa*`、`*credential*`、`*secret*`、`*.pfx` 等；命中时额外发一条 `info` 警示。
- **C-16** 不做内容特征级检测（不识别密钥样式），该取舍写入插件 README。

### 通知

- **C-17** 插入成功不通知（输入框里的引用块就是反馈）。
- **C-18** 只在失败（`notify('error', …)`）与敏感警示（`notify('info', …)`）时通知。
- **C-19** 一次操作最多产生一条通知：失败时只发 error，敏感命中时只发 info。

### 会话目标与失败路径

- **C-20** 插入目标是**当前屏幕上的会话**（`ctx.sidebarRight.mounted` / 当前会话作用
  域），预览地址里内嵌的 `sessionId` 只用于解析文件路径，不决定插入目标。
- **C-21** 无会话作用域、`insertQuote` 返回 `false`、选区为空或仅空白，均为失败分支：
  不插入任何内容，发一条 error 通知说明原因。
  - 后续口径（非权威历史注记）：通知是**会话绑定**通道，无屏幕会话或无保留作用域时没有
    可投递位点，这两类状态按"置灰 + 竞态静默"实现；其余失败分支各发一条 error。以
    [核心域实现](../core/implementation.md) §8.1 为准。

### 格式范围

- **C-22** 格式范围以**单一常量**声明为正向白名单（扩展名集合），包含 markdown、纯
  文本、常见代码、json/yaml/log/csv 等文字类格式；大小写不敏感，无扩展名不命中。
- **C-23** HTML 在 F01 完全不涉及：白名单不含 `html`，不注册任何接管相关内容，打开
  HTML 预览时按钮不出现。
- **C-24** 相对资源（CSS/JS/图片）读取不纳入 F01，整体推迟到 I001-F02。

### 架构接缝

- **C-25** 核心与格式适配通过**注册式适配器**分离：适配器声明 `id`、匹配哪些路径、
  以及从哪个根元素读取选区；核心只负责"取选区文本 → 组装引用 → `insertQuote` →
  `notify`"。
- **C-26** F02 必须能够只新增一个适配器而不修改核心流程；核心不得积累格式分支。

### 文案与本地化

- **C-27** 按钮标签、通知文案、指针块与来源行文案走 `ctx.locale.register`，提供中英
  两套字典。
  - 后续口径（非权威历史注记）：只有 **UI 文案**（按钮标签、通知）进字典；`来源：`、
    截断说明与指针块文案属**内容**，不进字典。以
    [引用内容契约](../core/quote-content-contract.md) §1/§2/§4 与
    [测试与验收](../core/testing-and-acceptance.md) U-17 为准。

### 验收

- **C-28** 端到端取证在**独立 profile + 独立端口**进行（默认 profile 名
  `side-quote-verify`、端口 `3181`，不得使用 3081），实验代码不进入用户 live profile。
- **C-29** 证据形式为浏览器自动化脚本，脚本放 `code/test/e2e/`，不进入
  `package.json` 的 `dependencies`，不进入制品 `files`；仓库命令表新增一条 e2e 命令。
- **C-30** "其他格式零影响"以逐格式人工回归确认：pdf、图片、xlsx、docx、未开启的
  HTML，预览表现与未安装插件时一致，且按钮均不出现。

## Behavior change summary

- Added:
  - 文本类文档预览工具栏出现「引用」按钮，按选区可用性置灰/可用。
  - 划词 → 点击 → 插入带工作区相对路径来源的引用块到当前会话输入框。
  - 同一会话同一文件的第二次引用降级为指针块。
  - 敏感文件名命中时的 info 警示通知。
  - 中英双语文案。
  - 仓库新增 e2e 验收命令与 `code/test/e2e/` 自动化脚本。
- Preserved:
  - 自带预览的渲染、翻页、行定位、工具栏、缩放与所有其它格式的表现完全不变。
  - 自带插件包不被修改、替换或卸载。
  - 输入框编辑器自身行为（引用节点语义、撤销、删除）不变。
- Removed or degraded:
  - 无用户可见功能被移除。
  - 降级项（新能力内建边界，非既有能力退化）：跨预览体选区不可引用；同一会话同一
    文件自第二次起不再贴原文；不做内容级敏感检测。
- High-impact removals confirmed individually: 不适用（无移除）。

## Authority consistency check

按 [文件权威地图](../../../../../../02-file-authority-map.md) 核对与本 Feature 相关的现行权威：

| 权威文档 | 核对结论 |
| --- | --- |
| [03-current-decisions.md](../../../../../../03-current-decisions.md) | 无冲突；本 Feature 不改变任何现行决策条目 |
| [code-ai/project-facts.md](../../../../../../code-ai/project-facts.md) | "零构建、零运行时依赖"成立（e2e 脚本属开发期工具，不入运行时依赖与制品）。但 §4 命令表与 §5 测试分层必须在本 Feature 实现阶段同步更新 |
| [validation/README.md](../../../../../../validation/README.md) | 一致；证据落 `verification.evidence_root`（`wiki/feature-workspace`），结论须可判定 |
| `product/product-vision.md`、`implementation/frontend/`、`testing/` | 尚未创建（权威地图中为占位路径），无冲突面 |

语义冲突：无。

由结论派生的变更义务（必须在实现阶段同批完成）：

1. `.factory/factory.yaml` 的 `commands` 新增 e2e 命令，并运行 `factory upgrade`
   重新生成 `wiki/governance/workflow-profile.md`。
2. `wiki/code-ai/project-facts.md` §4（真实命令）与 §5（测试分层）同步更新。

## Visual and interaction acceptance

- In scope: yes
- 要求：e2e 脚本在独立 profile、固定路由（右侧栏已打开目标文件预览）与固定视口下
  断言按钮可用/置灰、插入内容逐字一致、通知层级与文案；截图证据绑定受测构建（Git
  revision）与视口尺寸，落在 `wiki/feature-workspace/` 证据根内的 Feature 证据目录。

## Question inventory

| ID | Domain | Question | Why it matters | Status |
| --- | --- | --- | --- | --- |
| Q-01 | 交互 | 什么动作算"确认引用" | 决定交互契约与验收步骤 | confirmed → C-01 |
| Q-02 | 契约 | 引用块 `text` 形态 | 决定模型可见内容面 | confirmed → C-06 |
| Q-03 | 行为 | "已读过原文"判定层级 | 决定降级机制可靠性 | confirmed → C-10 |
| Q-04 | 行为 | 判定依据取到哪一层 | 决定耦合与回归风险 | confirmed → C-10 |
| Q-05 | 行为 | 插件记录的粒度 | 决定降级触发条件 | confirmed → C-11 |
| Q-06 | 契约 | 指针里的"哪里"如何表示 | 决定指针文案 | confirmed → C-12 |
| Q-07 | 安全 | 路径形式 | 命中 `local-machine-paths` | confirmed → C-09 |
| Q-08 | 安全 | 敏感文件策略 | 命中 `credentials` | confirmed → C-14 |
| Q-09 | 交互 | 通知语义 | 用户可见反馈 | confirmed → C-17/C-18 |
| Q-10 | 交互 | 按钮可用性与失败反馈 | 零误触、可观察失败 | confirmed → C-02/C-21 |
| Q-11 | 范围 | 格式范围界定方式 | 硬约束"只在一处声明" | confirmed → C-22 |
| Q-12 | 契约 | 插入目标会话 | 防止引用进错上下文 | confirmed → C-20 |
| Q-13 | 行为 | 摘录加工与上限 | 上下文成本与保真 | confirmed → C-07/C-08 |
| Q-14 | 契约 | 指针确切文案 | 模型与用户可理解 | confirmed → C-12 |
| Q-15 | 行为 | 350ms 防抖落点 | 需求原文硬点 | confirmed → C-03 |
| Q-16 | 行为 | 选区归属判定 | 防止引用错文件 | confirmed → C-04 |
| Q-17 | 范围 | 相对资源是否纳入 | 范围与成本 | confirmed → C-24 |
| Q-18 | 范围 | F01 的 HTML 姿态 | 安全姿态与零影响 | confirmed → C-23 |
| Q-19 | 架构 | 适配器接缝形状 | 决定"通用核心"成立 | confirmed → C-25/C-26 |
| Q-20 | 验收 | 端到端取证环境 | 验收前提，禁止碰 live | confirmed → C-28 |
| Q-21 | 验收 | 证据形式 | 验收可判定性 | confirmed → C-29 |
| Q-22 | 验收 | 自动化脚本落点与依赖边界 | 零依赖与可重跑 | confirmed → C-29 |
| Q-23 | 安全 | 警示触发规则 | 警示可信度 | confirmed → C-15/C-16 |
| Q-24 | 行为 | 截断上限数值与维度 | 上下文成本 | confirmed → C-08 |
| Q-25 | 回归 | 其他格式零影响验证方式 | 硬约束验收项 | confirmed → C-30 |
| Q-26 | 交互 | 文案与本地化 | 与平台一致 | confirmed → C-27 |
| Q-27 | 交互 | 插入后选区与焦点 | 视觉反馈唯一来源 | confirmed → C-05 |
| Q-28 | 行为 | 同文件重复点击语义 | 避免意外重复块 | confirmed → C-13 |

## Pending questions

无未决问题。

## Deferred out of this Feature

以下刻意推迟，实现期不得当作待讨论产品问题重新展开：

1. **D-01** 相对资源（CSS/JS/图片）读取 → 由 `I001-F02` 承担（C-24）。
2. **D-02** HTML 预览接管与默认关闭的显式开关 → 由 `I001-F02` 承担（C-23）。
3. **D-03** 覆盖 agent 自身读取行为的全量"会话已读"判定 → 需要新的 Feature 承载其
   耦合与回归风险；当前只认插件自身记录（C-10）。
4. **D-04** 内容特征级敏感检测（正则识别密钥样式）→ 未采纳，作为已知取舍写入
   `code/README.md`（C-16）。
5. **D-05** 跨预览体选区引用 → 不支持，作为已知取舍写入 `code/README.md`（C-04）。

## Required test cases

### 单元层（`node --test`，仓库 `test` / `verify` 命令覆盖）

1. 首次引用模板：输出为"摘录 + 空行 + `来源：<相对路径>`"，逐字比对。
2. 保真：含空行、缩进、制表符、行尾换行的选区不被重排或裁剪。
3. 截断：超 200 行 → 截到 200 行并追加截断说明；超 8000 字符 → 截到 8000 字符并追加
   说明；两者同时命中时先到先截。
4. 未命中截断时**不**出现截断说明。
5. 指针模板：同文件第二次 → 指针块，且不含原文摘录。
6. 已引用记录：首次 `false` → 原文，第二次 `true` → 指针；不同文件互不影响；不同
   `sessionId` 的记录互不共享。
7. 路径相对化：工作区内 → 相对；工作区外 → 保持原样；反斜杠归一为 `/`。
8. 格式白名单：md/txt/常见代码扩展名命中；pdf/png/xlsx/docx/html 不命中；无扩展名
   不命中；大小写不敏感。
9. 敏感文件名黑名单：`.env`、`.env.local`、`*.pem`、`*.key`、`id_rsa`、`*credential*`、
   `*secret*`、`*.pfx` 命中；`notes.md` 不命中。
10. 防抖：连续选区变化只在静默 350ms 后定稿一次；`dispose` 后不再触发。
11. 点击去重：处理中的重复点击只执行一次插入。
12. 失败分支：无会话作用域 → error 通知且不插入；`insertQuote` 返回 `false` → error
    通知；空白选区 → 按钮不可用。
13. 清理：插件停用后所有事件监听、定时器、订阅被释放（以 stub 计数断言）。
14. 适配器接缝：注册/注销幂等；`match` 决定可用性；以假适配器证明核心无需修改即可
    接纳新格式。

### 端到端层（`code/test/e2e/`，独立 profile + 独立端口）

- E1 打开 markdown 文件 → 划词 → 350ms 后按钮可用 → 点击 → 输入框出现引用块，内容
  为"摘录 + 来源：工作区相对路径"。
- E2 同一文件再划另一段 → 点击 → 出现指针块。
- E3 另一文件划词 → 点击 → 出现原文块（不同文件互不影响）。
- E4 打开 pdf / png / xlsx / docx / html → 按钮不出现，预览表现与未安装插件时一致。
- E5 打开合成 `.env` 夹具（合成内容，无真实密钥）→ 划词 → 点击 → 原样插入 + 一条
  `info` 警示。
- E6 不划词 → 按钮置灰。
- E7 划词后切到另一个 tab 再切回 → 按"严格同一预览体"与选区失效规则处理。
- E8 停用插件 → 按钮消失，无残留监听与控制台报错。

## Acceptance criteria

| ID | 判定 | 对应 |
| --- | --- | --- |
| AC-1 | 首次引用闭环：E1 通过，插入内容去掉每行 `> ` 前缀后与模板逐字一致 | C-06/C-07 |
| AC-2 | 指针降级：E2 通过，第二次插入为指针块且不含原文 | C-11/C-12/C-13 |
| AC-3 | 记录隔离：单测 6 + E3 通过 | C-10/C-11 |
| AC-4 | 路径形式：单测 7 通过，E1 中路径为工作区相对 | C-09 |
| AC-5 | 截断：单测 3、4 通过 | C-08 |
| AC-6 | 敏感警示：单测 9 + E5 通过，插入原样且只有一条 info | C-14/C-15/C-19 |
| AC-7 | 格式白名单：单测 8 通过，E4 中按钮均不出现 | C-22/C-23 |
| AC-8 | 按钮可用性：单测 10、11 + E6 通过 | C-02/C-03 |
| AC-9 | 失败反馈：单测 12 通过，均为 error 通知且无插入 | C-21 |
| AC-10 | 清理：单测 13 + E8 通过 | 约束 4 |
| AC-11 | 零构建与零运行时依赖：`code/package.json` 的 `dependencies` 为空；制品 `files`
 | 不含 `test`；`node --check code/index.js`、`node --check code/client.js` 通过 | 约束 5 |
| AC-12 | 未触碰 live 环境：证据显示 e2e 在独立 profile 与独立端口运行，全程未终止 3081
 | 进程 | C-28 |
| AC-13 | 其他格式零影响：E4 通过，且逐格式留档 | C-30 |
| AC-14 | 本地化：单测断言中英两套字典键齐全 | C-27 |

## Implementation document targets

- `core/implementation.md` — 核心流程、适配器接缝、事件与生命周期、清理责任、失败与
  通知路径、会话目标解析。
- `core/quote-content-contract.md` — 引用块与指针块模板、截断规则、路径相对化、敏感
  文件名单、格式白名单常量、已引用记录结构与隔离。
- `core/testing-and-acceptance.md` — 上文全部必测用例、验收标准、e2e 环境与证据形式、
  派生变更义务（命令表与 `project-facts.md` 同步）。
- 代码期写入（本阶段只定条目）：`code/README.md` 的已知取舍条目（D-04、D-05、
  "同文件第二次起只给指针"、"不做内容级敏感检测"、"升级需回归"）。

## Code AI profile targets

- `code-ai/README.md` — profiles 索引与阅读顺序。
- `code-ai/reading-agent-profile.md` — 实现前只读理解。
- `code-ai/core-implementation-agent-profile.md` — `core` 域实现。
- `code-ai/review-agent-profile.md` — 独立评审。
- `code-ai/verification-agent-profile.md` — 分离验收与 e2e 取证。
