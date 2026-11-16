# I001 Integration Test Handoff

## Merge Gate

Require all active Leaf Features ready. Integration testing must pass and record evidence before any Feature merge.
Generating this handoff does not verify integration or continuation of a prior run.

- Initiative source: [initiative.yaml](<../initiative.yaml>)

- Required context:
  - [feasibility/confirmed-constraints.md](<../feasibility/confirmed-constraints.md>)

## Included Features

### `I001-F01` 文本预览划词引用闭环（通用核心 + 文本格式适配）

- Source: [feature.yaml](<../features/feat-i001-f01-text-preview-quote/feature.yaml>)
- Lifecycle: `ready-to-merge / ready`
- Required context:
  - [../../feasibility/confirmed-constraints.md](<../feasibility/confirmed-constraints.md>)
  - [code-ai/implementation-plan.md](<../features/feat-i001-f01-text-preview-quote/code-ai/implementation-plan.md>)
  - [evidence/review-gate-record.md](<../features/feat-i001-f01-text-preview-quote/evidence/review-gate-record.md>)
- Dependencies: none
- Acceptance evidence:
  - [evidence/verification-record.md](<../features/feat-i001-f01-text-preview-quote/evidence/verification-record.md>)
  - [evidence/review-gate-record.md](<../features/feat-i001-f01-text-preview-quote/evidence/review-gate-record.md>)
  - [evidence/e2e/E-01-2-inserted.png](<../features/feat-i001-f01-text-preview-quote/evidence/e2e/E-01-2-inserted.png>)
  - [evidence/e2e/E-04-0-positive-control.png](<../features/feat-i001-f01-text-preview-quote/evidence/e2e/E-04-0-positive-control.png>)
  - [evidence/e2e/E-05-1-sensitive.png](<../features/feat-i001-f01-text-preview-quote/evidence/e2e/E-05-1-sensitive.png>)
  - [evidence/e2e/E-09-1-cross-pane-greyed.png](<../features/feat-i001-f01-text-preview-quote/evidence/e2e/E-09-1-cross-pane-greyed.png>)
  - [evidence/format-regression/format-regression-summary.json](<../features/feat-i001-f01-text-preview-quote/evidence/format-regression/format-regression-summary.json>)
- Closure validation:
  - [evidence/verification-record.md](<../features/feat-i001-f01-text-preview-quote/evidence/verification-record.md>)
  - [evidence/format-regression/format-regression-summary.json](<../features/feat-i001-f01-text-preview-quote/evidence/format-regression/format-regression-summary.json>)

### `I001-F02` HTML 预览接管适配（默认关闭、显式开启）

- Source: [feature.yaml](<../features/feat-i001-f02-html-preview-takeover/feature.yaml>)
- Lifecycle: `ready-to-merge / ready`
- Required context:
  - [../../feasibility/confirmed-constraints.md](<../feasibility/confirmed-constraints.md>)
  - [code-ai/implementation-plan.md](<../features/feat-i001-f02-html-preview-takeover/code-ai/implementation-plan.md>)
  - [evidence/review-gate-record.md](<../features/feat-i001-f02-html-preview-takeover/evidence/review-gate-record.md>)
  - [evidence/verification-record.md](<../features/feat-i001-f02-html-preview-takeover/evidence/verification-record.md>)
- Dependencies: `I001-F01`
- Acceptance evidence:
  - [evidence/verification-record.md](<../features/feat-i001-f02-html-preview-takeover/evidence/verification-record.md>)
  - [evidence/review-gate-record.md](<../features/feat-i001-f02-html-preview-takeover/evidence/review-gate-record.md>)
  - [evidence/e2e/E-10-3-comparison.json](<../features/feat-i001-f02-html-preview-takeover/evidence/e2e/E-10-3-comparison.json>)
  - [evidence/e2e/E-11-1-takeover-on.png](<../features/feat-i001-f02-html-preview-takeover/evidence/e2e/E-11-1-takeover-on.png>)
  - [evidence/e2e/E-12-1-drag-quote.png](<../features/feat-i001-f02-html-preview-takeover/evidence/e2e/E-12-1-drag-quote.png>)
  - [evidence/e2e/E-16-1-gate-closed.png](<../features/feat-i001-f02-html-preview-takeover/evidence/e2e/E-16-1-gate-closed.png>)
  - [evidence/e2e/E-18-1-plugin-disabled.png](<../features/feat-i001-f02-html-preview-takeover/evidence/e2e/E-18-1-plugin-disabled.png>)
  - [evidence/manual-final/manual-summary.json](<../features/feat-i001-f02-html-preview-takeover/evidence/manual-final/manual-summary.json>)
- Closure validation:
  - [evidence/verification-record.md](<../features/feat-i001-f02-html-preview-takeover/evidence/verification-record.md>)
  - [evidence/workspace-validation.md](<../features/feat-i001-f02-html-preview-takeover/evidence/workspace-validation.md>)
  - [evidence/e2e/E-10-3-comparison.json](<../features/feat-i001-f02-html-preview-takeover/evidence/e2e/E-10-3-comparison.json>)
  - [evidence/manual-final/manual-summary.json](<../features/feat-i001-f02-html-preview-takeover/evidence/manual-final/manual-summary.json>)

## Required Evidence

- End-to-end dependency-chain execution results.
- Cross-Feature contract and boundary assertions.
- Production-safety, redaction, and negative-path results where applicable.
- Exact commands, environment identity, timestamps, and immutable evidence paths.
- Preserve inherited linked object/artifact/session/sequence conditions and locate actual continuation state from the cited records. Missing entries remain unverified.
- Record replaced evidence sources, retained/lost continuity and affected criteria in the existing plan/result mapping. A rebuilt scenario does not by itself prove continuation of the original chain.

## Result

Record PASS only through `initiative-integration-result` after every required test passes. A failure blocks all Feature merges for this Initiative.
