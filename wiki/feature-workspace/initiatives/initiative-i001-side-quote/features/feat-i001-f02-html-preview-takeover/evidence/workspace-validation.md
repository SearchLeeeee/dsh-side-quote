# I001-F02 工作区校验证据

> 用途：`closure.validation_evidence` 指向的工作区与流程门禁记录。命令只来自
> `.factory/factory.yaml`（`factory upgrade` 生成的 `wiki/governance/workflow-profile.md`）。

## 1. 执行环境

| 项 | 值 |
| --- | --- |
| 工作仓库 | `D:\dsh-side-quote`（mono） |
| 代码 revision | `d4f6eab`（F02 实现与测试层修复后的被测修正） |
| factory | `D:\HighLand-factory`（factory 0.1.0，Python 3.12 / PyYAML 6.0.3） |
| 隔离实例 | 临时 `DSH_HOME` + profile `side-quote-verify` + 端口 `34181`（验收后已停止并回收） |
| live 基线 | `3081` 监听 PID `67988`，启动 `2026-11-15 22:04:50`，全程未重启/未终止/未写入 |

## 2. 机器门禁（acceptance / completed 时执行）

```text
$ python <FACTORY_ROOT>/engine/factory.py doctor --work D:\dsh-side-quote
[OK  ] PYTHON_YAML: python has PyYAML (3.12.13 6.0.3)
[OK  ] FACTORY_VERSION: factory 0.1.0 satisfies >=0.1.0 <0.2.0
[OK  ] LAYOUT: work repo layout present
[OK  ] CODE_ROOT: code root: D:\dsh-side-quote\code
[OK  ] AGENTS_MD: AGENTS.md present
[OK  ] GIT: work repo is a git repository
[OK  ] PROFILE: workflow profile matches recorded hash
[OK  ] BASELINE: baseline evidence recorded
[OK  ] GATE_WIKI: wiki gate passed
[OK  ] GATE_WORKSPACE: workspace gate passed
Doctor: 0 error(s), 0 warning(s)                                              → exit 0

$ python <FACTORY_ROOT>/engine/factory.py gate workspace --work D:\dsh-side-quote
feature workspace is valid                                                    → exit 0
```

## 3. 生命周期转换（经状态机记录，未手工改 phase/state）

```text
transition --phase implementation --state completed   → feature workspace is valid
transition --phase review         --state in-progress → feature workspace is valid
transition --phase review         --state completed   → feature workspace is valid
transition --phase acceptance     --state in-progress → feature workspace is valid
transition --phase acceptance     --state completed   → feature workspace is valid
transition --phase ready-to-merge --state ready       → feature workspace is valid
```

每次转换后立即执行 `factory gate workspace`，全部 exit 0；转换因
`closure validation evidence file is missing: evidence/workspace-validation.md` 曾被拒绝一次，
补齐本文件后通过（记录该失败事实，不隐去）。

## 4. 验收与评审证据

- 固定评审门两轮：`evidence/review-gate-record.md`（第 1 轮有条件通过 → 修复 → 第 2 轮通过；
  第 3 轮定向复审通过）。
- 独立验收：`evidence/verification-record.md`（AC-17…AC-30 全部通过；提交版 e2e 17/17、
  skip 0；人工回归 3/3；`3081` 前后一致；清理完成）。
- 关键文件：`evidence/e2e/E-10-3-comparison.json`（关闭态两阶段同一区域逐字节相同）、
  `evidence/manual-final/manual-summary.json`（人工回归汇总）。

## 5. 复现方式

```powershell
$env:DSH_HOME = '<临时目录>\dsh-home'
dsh --profile side-quote-verify --from-default-profile web --dump-config
dsh plugin --profile side-quote-verify add D:\dsh-side-quote\code
dsh --profile side-quote-verify --no-open --port 34181        # 记录启动 URL 与 token（不写入证据）

node --check code/index.js
node --check code/client.js
node --test --test-concurrency=1 "code/test/**/*.test.mjs"

$env:SIDE_QUOTE_E2E_BASE_URL = 'http://127.0.0.1:34181/?token=<boot token>'
$env:SIDE_QUOTE_E2E_CDP      = 'http://127.0.0.1:<cdp port>'
$env:SIDE_QUOTE_E2E_EVIDENCE_DIR = '<feature>\evidence\e2e'
$env:SIDE_QUOTE_E2E_PROFILE  = 'side-quote-verify'
node --test --test-concurrency=1 "code/test/e2e/**/*.test.mjs"
```

判据：`factory gate workspace` exit 0，且 `acceptance.passed === true` 的每条证据文件存在且可读。
