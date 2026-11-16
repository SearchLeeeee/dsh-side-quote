# Architecture

本目录承载 dsh-side-quote 的系统边界、模块划分与外部依赖面。它回答「插件站在哪里、
允许碰什么」，不回答产品行为（见 [Product](../product/README.md)）或实现细节
（见 [Implementation](../implementation/README.md)）。

## 文档

- [系统边界与模块划分](module-boundaries.md)：运行形态、与平台自带实现的边界、只读依赖面、模块内分层、数据与安全边界。

## 相关权威

- 冲突裁决：[文件权威地图](../02-file-authority-map.md)。
- 验收结论：[测试与验收](../testing/sidebar-quote-acceptance.md)。
