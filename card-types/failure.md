---
name: failure
status: adopted
use_when: any work that failed, was aborted, or stopped partway
blocks_required: [text, compare]
blocks_optional: [files, diff, checklist]
---
Status is `failed` or `partial`. Before/after becomes expected vs. actual.

- `text`: where it stopped and the cause as far as known, in two lines.
- `compare`: expected vs. actual (the error text as `code`, copyable).
- `next`: the exact steps to resume, starting from where it stopped.
- `repro`: the command and config that reproduce the failure.

Confidence: say plainly whether the cause is confirmed or a hypothesis.
