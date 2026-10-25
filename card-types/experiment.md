---
name: experiment
status: adopted
use_when: LLM prompt, schema or model changes, RAG or retrieval changes, training or fine-tuning runs compared to a baseline
blocks_required: [axes, metrics]
blocks_optional: [diff, samples, chart, gallery, text]
---
Before/after is baseline run vs. new run on the same inputs.

- LLM: log with `readout.llm_call`, build with `python3 -m readout compare <baseline> <new>`, then write `verdict`, a `text` interpretation and `next`. Read the regressed samples before writing the verdict.
- Retrieval or RAG: `samples` rows are query → top-k ids or captions before/after; `gallery` when results are images; recall@k or MRR in `metrics`.
- Training: `chart` overlaying both runs' curves, final eval in `metrics`, hyperparameter changes as an `axes` row each or a `diff` of the config.

Confidence: a delta inside its CI is 판단 보류, never 개선. More than one changed axis → say the cause is not separable. Name the eval size n.
