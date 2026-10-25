---
name: performance
status: adopted
use_when: speed, memory, latency, throughput or cost optimization
blocks_required: [metrics]
blocks_optional: [chart, compare, embed, text]
---
Before/after is the same workload measured the same way on both versions.

- Measure at least 3 repetitions each; `metrics` rows carry `n` and `ci` (95% half-width) so noise shows as 판단 보류.
- `chart` per-repetition values or latency percentiles overlaid.
- A flame graph or profile goes in `embed` (SVG or HTML asset).
- Report the cost of the gain too (memory, complexity) as its own row.

Confidence: verified only with repetitions on comparable load; a single run is estimated.
