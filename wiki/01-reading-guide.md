# 01. 阅读路径

本文件定义不同角色如何从当前长期文档导航进入最小必要的权威文档集合。路径只
给链接和一句理由；业务规则一律在目标文档里。

## 新加入的人类维护者

1. [人类入口](human/README.md)：先看这个目录服务谁、按什么顺序读。
2. [系统总览](human/system-overview.md)：用一页纸理解系统目标和边界。
3. [当前决策](03-current-decisions.md)：确认现在哪些规则有效。
4. [文件权威地图](02-file-authority-map.md)：知道冲突时听谁的。
5. [Wiki 根 MOC](README.md)：按主题继续深入。

## Agent / Code AI 实现者

1. [Code AI 入口](code-ai/README.md)：选择与本任务匹配的 agent profile。
2. [文件权威地图](02-file-authority-map.md)：确认本次改动会影响哪些权威文档。
3. [当前决策](03-current-decisions.md)：确认边界与禁止项。
4. [Governance](governance/README.md)：确认本次改动走哪条流程通道。

## 了解插件能力与实现契约

1. [产品目标](product/product-vision.md)：先确认用户可见能力与明确不做的范围。
2. [系统边界](architecture/module-boundaries.md)：确认插件能碰哪些位点与服务。
3. [引用内容契约](implementation/frontend/sidebar-quote-contract.md)：进入消息正文的内容格式与安全规则。
4. [引用实现契约](implementation/frontend/sidebar-quote-implementation.md)：接入位点、归属校验与失败路径。
5. [测试与验收](testing/sidebar-quote-acceptance.md)：改动的验收判定与证据形式。

## 维护者 / 文档治理

1. [Wiki 运行规范](00-spec.md)：结构、链接和维护规则。
2. [Governance](governance/README.md)：边界与文档协议。
3. [Workflow Profile](governance/workflow-profile.md)：当前 owner、命令和门禁。
4. [File Authority Map](02-file-authority-map.md)：职责与权威归属。
5. [Validation](validation/README.md)：验证记录与证据索引。

## 新增或修改 Feature

1. 从[文件权威地图](02-file-authority-map.md)确定需要检查和更新的权威文档。
2. 查看[当前决策](03-current-decisions.md)，确认不会与现行规则冲突。
3. 按受影响领域进入对应主题目录；该主题尚无权威文档时，先添加首篇文档并创建
   `README.md` 作为 MOC。
4. 临时讨论、状态与证据只写在 `wiki/feature-workspace/` 中；稳定结论验收后才回到
   长期文档。

## 专题深入

用户明确发起 `$hl-refactor` 时，仍先完成 Code AI 入口和角色要求的全部通用必读，
再读取该运行的范围、用户选择与证据。过程区位置和排除清单从 Workflow Profile
解析；不要求不存在的 Feature profile，也不把历史讨论当成当前能力说明。

按需进入 `product/`、`domain/`、`architecture/`、`implementation/`、`features/`、
`testing/` 或 `validation/`。一个主题有首篇权威文档时，再创建该目录的 `README.md`
作为 MOC；空主题不需要索引文件。

领域 MOC 只负责发现。遇到冲突时回到[文件权威地图](02-file-authority-map.md)，
不能按目录位置、文件新旧或历史命名猜测权威。
