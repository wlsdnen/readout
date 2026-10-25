---
name: explain
description: Turn finished work into a result card a person grasps in seconds — one-line verdict, before/after, interpretation, performance, confidence, next steps — shown in the readout dashboard. Use whenever reporting what was done, a result, a failure, what changed, a comparison or an experiment (LLM prompt/schema/model, training, data, performance); and when the user says "보여줘", "시각화", "그림으로", "결과 정리", "visualize", "explain visually".
---

# Explain: result cards

Helpers are the `readout` Python package. Run them as `PYTHONPATH=${CLAUDE_PLUGIN_ROOT}/src python3 ...` (or plainly, where `pip install` put `readout` in the environment).
The readout mod adds `files` and `timeline` blocks to the card written during the turn, so write the card before the turn ends and do not build those two by hand.
Data folder: `$READOUT_DIR`, else `~/.claude/readout`.

## 1. Choose the card type

Card types are the built-in `${CLAUDE_PLUGIN_ROOT}/card-types/*.md` plus the user's own in `<data folder>/card-types/*.md` (a user type wins over a built-in of the same name). Read their frontmatter and pick the type whose `use_when` fits; then read that file's body and follow it. Several unrelated results in one turn → one card each, at most three.
No type fits → go to step 5 after building the card.

## 2. Build the card from real data

```python
from readout import new_card, add_block, diff_block, asset_dir, save
c = new_card("<type>", "<short title>", verdict="<one line: what happened, with the key number>",
             status="success|partial|failed", project="<session working directory>", unexpected=False)
add_block(c, "compare", "전 / 후", before={"number": 1.24, "unit": "s"}, after={"number": 0.31, "unit": "s"})
c["confidence"].append({"claim": "...", "level": "verified|estimated|unverified"})
c["next"] = ["..."]; c["repro"] = {"command": "...", "config": "..."}
print(save(c).stem)
```

- Block kinds and their fields: `KINDS` in `${CLAUDE_PLUGIN_ROOT}/src/readout/cards.py`; the dashboard draws each one. `compare` sides take a string, `{"number", "unit"}`, `{"code"}` or `{"image": "<file in asset_dir(c)>", "caption"}`.
- Pictures, screenshots, plots: save into `asset_dir(c)` and reference by file name. UI before/after: screenshot both versions (in Orca: `orca screenshot --json`, base64 `result.data`; add `--environment <name>` when the browser runs on a paired machine). Plots: matplotlib via `uv run --with matplotlib`. Anything no block draws (flame graph, interactive demo, video page): an HTML or SVG asset in an `embed` block.
- LLM experiments: log every call with `readout.llm_call(...)` (input, prompt, schema, model, params, output, expected, score) per run, then `python3 -m readout compare <baseline> <new>` writes the card; read its regressed samples, then load it, fill `verdict`, a `text` interpretation and `next`, and `save` again.
- Never invent a number, screen or sample. Missing data → a `confidence` row at `unverified`, not a guess.
- Metrics: give `n` and `ci` whenever repetitions or samples exist; leave `better` out where a change is neither good nor bad.
- Mark `unexpected: True` when the result contradicts what the work aimed for (slower, worse, costlier).

## 3. Keep as text, never only inside a picture

Commands, code, paths, error messages, exact values: put them in `compare` `code` sides, `diff` blocks or `repro`. Every image gets a caption or alt text.

## 4. Reply

Chat reply: the verdict line and the card link `http://localhost:<port>/#card=<id>` (port from the readout plugin settings, 8765 by default), plus anything the user must act on. Nothing that repeats the card.

## 5. When no type fits, or a type falls short

- Build the card on the common skeleton with the blocks that suit the work, and set `c["proposal"] = {"typeName": "<name>", "why": "<what this work needs that existing types miss>", "blocks": [...]}`.
- Ask once with AskUserQuestion, options 채택 / 수정 / 이번만. 채택 or 수정 → write `<data folder>/card-types/<name>.md` in the format of the built-in files with `status: trial`.
- Using a `trial` type again after the user kept it → set it to `adopted`.
- The user says a block is useless or something is missing, or the same block keeps coming out `unverified` → propose the edit; a built-in type is changed by copying it to `<data folder>/card-types/` and editing the copy.
- The rules for the registry: `${CLAUDE_PLUGIN_ROOT}/card-types/README.md`.
