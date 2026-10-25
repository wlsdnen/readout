---
name: change
status: adopted
use_when: code or config edits, bug fixes, refactors, dependency upgrades, deploy changes
blocks_required: [compare, files]
blocks_optional: [diff, metrics, text, gallery, checklist]
---
Before/after is the behavior a person notices: the error vs. its absence, the old vs. new screen (`orca screenshot` both), the number that moved. The `files` block comes from the mod automatically.

- Bug fix: `text` cause chain (repro → cause → fix), `compare` error before / passing after, the regression test named in `confidence`.
- Refactor: the claim is "behavior unchanged"; prove it with `metrics` of test counts and identical outputs, not with prose.
- Dependency upgrade: `compare` versions, `checklist` of breaking changes touched.
- Config or deploy: `diff` of the config with secrets masked, rollback command in `repro`.

Confidence: verified only for what was run here (tests, the screen, the measured number).
