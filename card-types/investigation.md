---
name: investigation
status: adopted
use_when: research, design decisions, tool or library choices, root-cause analysis without a code change
blocks_required: [text]
blocks_optional: [metrics, compare, embed, checklist]
---
Before/after becomes option vs. option: `metrics` with `labels` naming the options and one row per criterion, `compare` for the two leading options in a line each.

- `text` states the recommendation and the one reason that decides it.
- Each factual claim about an external product traces to a source fetched in this session; list them in `repro`.

Confidence: verified for fetched facts, estimated for judgments, unverified for anything not checked.
