# dsh-side-quote

DSH Web 客户端插件：在右侧栏预览里划词，自动把选中文字作为带来源路径的引用块插入
当前会话输入框，用户接着提问即可让模型按路径回读原文件。

## 当前状态

- 仓库已按 HighLand-factory 初始化，门禁通过（`factory doctor --strict`、`factory gate all`）。
- `code/` 目前只有**零逻辑安装骨架**（`package.json` / `index.js` / `client.js` /
  `cordis.patch.yml`）和一个零构建加载的冒烟测试；划词、引用插入与渲染器接管尚未实现。
- 插件尚未安装到任何 DSH profile，也尚未改动画词行为。

## 目录

| 路径 | 作用 |
| --- | --- |
| `code/` | 插件源码（零构建：`client.js` 即浏览器模块）。 |
| `wiki/` | 长期文档权威根，入口 [wiki/README.md](wiki/README.md)。 |
| `.factory/` | 工作流配置；`factory.yaml` 为唯一事实源，`local.yaml` 不入库。 |

## 开发方式

本仓库的变更走 HighLand-factory 流程，不直接手改后提交：

- 新能力或跨模块改动：先 `$hl-feasibility-grill` 做可行性拷问，再进入 Initiative / Leaf Feature。
- 边界明确的 bugfix 或细节调整：`$hl-quick-change`。
- 任何实现前先跑 `factory doctor --work .`。

已配置的真实命令（见 `.factory/factory.yaml`）：

```text
node --check code/index.js
node --check code/client.js
node --test --test-concurrency=1 "code/test/**/*.test.mjs"
```

首次基线与已知缺口记录在 [wiki/validation/init-baseline.md](wiki/validation/init-baseline.md)。

## 许可

MIT（见 `.factory/factory.yaml` 的 `project.license`；仓库尚未加入 `LICENSE` 文本文件）。
