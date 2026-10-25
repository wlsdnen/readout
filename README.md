# readout

English | [한국어](README.ko.md)

See what Claude Code is doing while it works, and get every finished piece of work back as a result card you can read in seconds.

- **Live**: a pane beside the chat and a local dashboard show the main loop and every subagent (current tool, tool count, elapsed time) plus progress of your own jobs (training, LLM batches, scripts) with sparklines.
- **Result cards**: each turn that edits files gets a card automatically; Claude writes interpreted cards with a one-line verdict, before/after, metrics judged as improved / worse / undecided (within the confidence interval), samples, confidence per claim, next steps and repro info.
- **LLM experiments**: log calls with input, prompt, schema, model and output; comparing two runs shows which of the four changed, the prompt and schema diffs, metrics on shared samples and the samples whose output changed.
- **Card types grow with use**: seven built-in types (change, experiment, data, performance, investigation, failure, retrospective); when none fits, Claude proposes a new one and you decide.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install readout --marketplace wlsdnen/readout
```

From a shell: `claude plugin install readout --marketplace wlsdnen/readout`. From a local clone: `claude plugin marketplace add <path to clone>` then `claude plugin install readout@readout`.

The dashboard is at http://localhost:8765 once a session has started (open it in any browser, or in Orca's built-in browser). `/readout` opens or closes the pane (or click its ✕; while the pane has the keyboard, Esc returns to the prompt); `/readout:explain` writes a result card on demand.

Requires macOS or Linux with `python3` on the PATH.

## Settings

Change them in `/config` under readout.

| Setting | Default | What it does |
|---|---|---|
| Dashboard port | 8765 | Port of the local dashboard, bound to 127.0.0.1 |
| Tunnel host | empty | An ssh host whose own localhost should reach this dashboard, for a browser on another machine (`ssh -R`, key auth required) |
| Visual-first reporting | on | Adds a short system-prompt section telling Claude to report finished work as a result card |
| Open pane at start | on | Opens the pane when a session starts, in a terminal 144 columns or wider |

Where another plugin bypasses other plugins' system-prompt sections (the debug log says `readout: prompt.compose bypassed by <plugin>`), visual-first reporting has no effect; put the same instruction in your CLAUDE.md instead, e.g. "When reporting finished work, follow the `readout:explain` skill."

Data lives in `$READOUT_DIR`, else `~/.claude/readout`: `cards/`, `jobs/`, `runs/`, `blobs/`, `sessions/`, and your own `card-types/`.

## Reporting from your code

```sh
pip install "git+https://github.com/wlsdnen/readout"    # or: pip install -e <path to clone>
```

```python
from readout import track, emit, llm_call

for batch in track(loader, "train"):            # progress bar + percentage
    ...
emit("train", "eval", pct=40, msg="epoch 4", loss=0.31)   # numeric fields become the sparkline

llm_call("cls-v2", sample_id=s.id, input=s.text, output=out, prompt=PROMPT, schema=SCHEMA,
         model="claude-sonnet-5-5", params={"temperature": 0}, expected=s.label, score=float(out == s.label))
```

Shell: `python3 -m readout emit <job> <stage> [pct] [msg]`. Compare two LLM runs: `python3 -m readout compare <baseline run> <new run>`. A complete prompt experiment is in `examples/sentiment/`.

## Layout

| Path | What it is |
|---|---|
| `.claude-plugin/` | plugin manifest (settings) and marketplace entry |
| `hooks/register.tsx` | the mod: tracks agents and tool calls, writes auto cards, draws the pane, serves the dashboard |
| `hooks/visual-first.md` | the system-prompt section added when visual-first reporting is on |
| `skills/explain/` | how Claude turns finished work into a card |
| `card-types/` | built-in card types and the rules for adding one |
| `dashboard/index.html` | the dashboard: live strip, card list, card detail |
| `src/readout/` | Python package: progress, cards, LLM log, run comparison, CLI |

## Development

```sh
PYTHONPATH=src python3 -m unittest discover -s tests
claude plugin validate . && claude plugin test .
```

`claude --plugin-dir .` runs a session with the working copy.

## License

MIT
