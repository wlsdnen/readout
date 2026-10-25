"""LLM call log for experiment cards: <monitor dir>/runs/<run>/calls.jsonl; prompts and schemas stored once in blobs/.

    from readout import llm_call
    llm_call("cls-v2", sample_id=s.id, input=s.text, output=out, prompt=PROMPT, schema=SCHEMA,
             model="claude-sonnet-5-5", params={"temperature": 0}, expected=s.label, score=float(out == s.label))
Then: python3 -m readout compare cls-v1 cls-v2
"""

import hashlib
import json
import subprocess
import time
from pathlib import Path

from .paths import data_dir


def _dumps(value):
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True, indent=1)


def blob(value):
    """Store text (or a JSON value) once by content hash; returns the hash, or None for None."""
    if value is None:
        return None
    text = _dumps(value)
    sha = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    path = data_dir() / "blobs" / f"{sha}.txt"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return sha


def read_blob(sha):
    return (data_dir() / "blobs" / f"{sha}.txt").read_text(encoding="utf-8") if sha else ""


def _commit(path):
    where = Path(path).parent if path else Path.cwd()
    try:
        out = subprocess.run(["git", "-C", str(where), "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
        return out.stdout.strip() or None
    except OSError:
        return None


def llm_call(run, *, sample_id, input, output, prompt, model, schema=None, params=None, usage=None,
             latency_ms=None, expected=None, score=None, valid=None, prompt_path=None):
    run_dir = data_dir() / "runs" / run
    run_dir.mkdir(parents=True, exist_ok=True)
    row = {
        "t": time.time(),
        "sample_id": str(sample_id),
        "input": input,
        "input_sha": blob(input),
        "output": output,
        "prompt_sha": blob(prompt),
        "schema_sha": blob(schema),
        "model": model,
        "params": params or {},
        "usage": usage or {},
        "latency_ms": latency_ms,
        "expected": expected,
        "score": score,
        "valid": valid,
    }
    meta = run_dir / "meta.json"
    if not meta.exists():
        meta.write_text(json.dumps({
            "run": run, "createdAt": row["t"], "prompt_path": prompt_path, "commit": _commit(prompt_path),
        }, ensure_ascii=False), encoding="utf-8")
    with (run_dir / "calls.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_run(run):
    run_dir = data_dir() / "runs" / run
    meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
    calls = [json.loads(x) for x in (run_dir / "calls.jsonl").read_text(encoding="utf-8").splitlines() if x]
    return meta, calls


def pin_baseline(project, run):
    path = data_dir() / "baselines.json"
    pins = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    pins[project] = run
    path.write_text(json.dumps(pins, ensure_ascii=False, indent=1), encoding="utf-8")
