# I001-F01 可行性结论摘要

- 结论：`Conditionally feasible`（附条件可行）
- 共享约束：[I001 可行性确认约束](../../feasibility/confirmed-constraints.md)（必读，不得重复论证）

## 本 Feature 的成立条件

1. 文本类预览格式的选区能被读到，且能稳定归属到当前预览文件的来源路径；归属方式
   必须走受支持的位点，不得依赖其它插件的内部 DOM 细节。
2. 插入与通知只经 `ctx.conversation.input`（`insertQuote` / `notify`）完成，不接管
   输入框组件本身。
3. 监听、定时器与订阅在插件停用时全部释放；重复触发与同一选区重入必须可控。
4. 引用路径形式与敏感内容策略按讨论定案后为显式规则，不做「原样全发」的默认。

## 主要难点与负向影响

- 端到端行为只能靠浏览器取证，仓库命令只覆盖纯逻辑；证据形式是本 Feature 的验收前提。
- 引用会携带文件内容与本地路径进入会话，属敏感数据面，需在讨论中定死规则。
- 手写 bundle 与该版本客户端接口强耦合，升级后需要回归。

## 拆分判断

Scope Gate 总分 11，`split-default`；按格式再拆不产生独立价值闭环，保留理由已写入
`feature.yaml` 的 `scope_gate.indivisibility_reason`。
