# 当前决策

本文件只记录当前仍然有效的跨领域决策。字段、阈值、状态机和测试细节以[文件权威
地图](02-file-authority-map.md)指定的领域文档为准。已失效的决策直接删除；历史由
Git 保留。

## 使用规则

- 只写「现在成立」的规则，不写「曾经如何」；历史材料不进入本文件。
- 每条规则一句话给结论，细节用链接指向权威文档。
- 同一事实不在本文件与领域文档中维护两个版本：一处权威，另一处只能是链接。
- 只有跨领域规则才写进本文件；单领域事实写在对应领域文档。
- 编号、路径和状态名使用反引号，保持与代码一致。

## 产品边界

下面是本项目当前生效的边界条目。它们由 `.factory/factory.yaml` 的 `security` 与
`project` 字段渲染而来；**列表为空表示尚未登记，不表示默认允许**。

### 禁止操作

- write-outside-work-repo
- modify-or-uninstall-dsh-builtin-plugin
- restart-or-kill-user-dev-server-without-approval
- secret-value-in-repo
- credential-echo-to-log
- history-rewrite-on-shared-branch
- production-write-without-approval

### 敏感数据类别

- credentials
- personal-data
- account-identifiers
- internal-endpoints
- local-machine-paths

新增或调整边界时，必须同时修改 `factory.yaml`（结构化事实）和本小节（自然语言
解释），并在同一次变更中运行 `factory upgrade`。

## 引用能力

以下为跨领域规则（同时约束产品行为、实现与安全面），细节在
[前端契约](implementation/frontend/sidebar-quote-contract.md)与
[实现契约](implementation/frontend/sidebar-quote-implementation.md)：

- 插入与通知只经 `ctx.conversation.input` 的 `insertQuote` 与 `notify`；插件不接管输入框组件。
- 引用必须由用户显式点击按钮触发；不做自动插入、不绑快捷键。
- 进入消息正文的来源路径只有引用块 `text` 里的 `来源：` 行；`summary` 只是输入框内的展示副本。
- 引用内容对来源路径与文件内容敏感：路径按工作区相对化输出，敏感文件名只警示不拦截，不做内容特征级检测。
- 同一会话内同一文件自第二次引用起只插入指针块；记录只在插件内存，插件停用即清空，不持久化。
- 新增可引用格式只允许新增适配器，不改核心流程，也不新增格式专用的模板或截断规则。
- 浏览器行为结论必须有端到端证据；端到端取证只在独立 profile 与独立端口进行，端口不得使用用户 live 实例。

## 数据与安全

- 敏感数据的类别以 `factory.yaml` 的 `security.sensitive_classes` 为准。
- 机密只保存在本地 `security.secrets_file` 指定的文件；文档、日志、证据和提交
  信息中不得出现真实值。
- 对外输出（接口、UI、日志、证据）必须能说明来源、时间和状态，不得伪造或推断。

## Agent 与工作流

- 流程门禁的开关以 `factory.yaml` 的 `workflow` 为准，摘要见
  [Workflow Profile](governance/workflow-profile.md)。
- 实现、review、验证三者分离：同一 session 不得自我验收。
- 合并长期文档需要 owner 显式授权；未授权时结论只留在临时工作区。
- 临时工作区中的 I/F 编号、retained 路径和反向历史链接不得写进权威文档。

## 文档规则

- [wiki/README.md](README.md) 是长期文档唯一入口，[02-file-authority-map.md](02-file-authority-map.md)
  裁决冲突。
- MOC 只负责导航；业务规则必须写在对应权威文档。
- 正文语言为 zh-CN；代码、API、字段、路径保留英文。
- 新需求先更新权威文档，再实现代码；代码改变契约时必须同步文档。
- 生成文件（如 `governance/workflow-profile.md`）不得手工编辑。

## 费曼检查

读者读完后应能回答三个问题：当前事实在哪里、冲突时哪个文件裁决、哪些操作被明确
禁止。若无法回答，说明本文件写成了历史记录或规则清单，需要收敛。
