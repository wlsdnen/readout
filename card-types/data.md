---
name: data
status: adopted
use_when: preprocessing, cleaning, dataset building, ETL, schema or distribution changes in data
blocks_required: [metrics, chart]
blocks_optional: [samples, gallery, compare, text]
---
Before/after is the dataset entering vs. leaving the step.

- `metrics` rows per stage with counts (no `better`: a drop is not a loss by itself).
- `chart` the key distribution before and after (length, label balance, score).
- `samples` or `gallery`: real examples of what was dropped or changed, at least one per rule.

Confidence: verified when counts come from the run's output files; flag any rule whose drop rate looks surprising as `unexpected`.
