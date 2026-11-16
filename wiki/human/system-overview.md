# 系统总览

## 一句话定位

dsh-side-quote 让 DeepSeek Harness Web 的右侧栏文档预览变成可引用的来源：用户在预览里
划词、点「引用」，插件把选中文字组装成带工作区相对路径的引用块插入当前会话输入框。

## 做什么

- 在文本类文档预览头部提供「引用」按钮，按选区可用性置灰或可用。
- 把选区组装成「摘录 + 空行 + `来源：<工作区相对路径>`」插入当前会话输入框。
- 同一会话同一文件自第二次引用起降级为指针块，避免重复贴原文。
- 敏感文件名命中时照常插入并给出一条 `info` 警示；失败才发 `error`。
- `.html` / `.htm` 预览提供**默认关闭**的接管开关：显式开启且平台页面脚本闸门为开时，由
  本插件渲染预览并允许在其中划词引用；接管开启时不加载外部 CSS / JS / 图片。

## 不做什么

- 不做自动插入、不绑快捷键；不接管输入框组件。
- 不支持跨预览体选区，不做内容特征级敏感检测，不做全量「会话已读」推断。
- 不修改、不替换、不卸载任何自带插件包；不引入构建链与运行时依赖。

边界与降级清单见[产品目标](../product/product-vision.md)，跨领域规则见
[当前决策](../03-current-decisions.md)。

## 主要组成部分

| 部分 | 职责 | 权威文档 |
| --- | --- | --- |
| 代码根 `code/` | 手写已构建的客户端 bundle 与宿主半、测试 | [实现契约](../implementation/frontend/sidebar-quote-implementation.md) |
| 文档根 `wiki/` | 长期权威文档 | [Wiki 根 MOC](../README.md) |
| 产品能力 | 用户可见能力与边界 | [产品目标](../product/product-vision.md) |
| 系统边界 | 允许的位点、服务与安全面 | [系统边界](../architecture/module-boundaries.md) |
| 验收判定 | 测试分层、用例与结论 | [测试与验收](../testing/sidebar-quote-acceptance.md) |
| 配置面 `.factory/` | 项目身份、命令与门禁 | [Workflow Profile](../governance/workflow-profile.md) |

## 关键约束

- 数据与安全的敏感类别见 `.factory/factory.yaml` 的 `security`；引用同时命中
  `local-machine-paths` 与 `credentials`。
- 流程门禁见[当前决策](../03-current-decisions.md)与
  [Workflow Profile](../governance/workflow-profile.md)。
- 浏览器行为只能由端到端证据支撑，且取证环境必须与用户正在使用的实例隔离。

## 下一步读什么

- 想动手改代码：读[阅读路径](../01-reading-guide.md)中的「了解插件能力与实现契约」。
- 想改文档：读[Wiki 运行规范](../00-spec.md)。
