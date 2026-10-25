"""Job progress: one JSON line per event in <data dir>/jobs/<job>.jsonl, drawn live by the pane and dashboard.

    from readout import track, emit
    for batch in track(loader, "train"): ...
    emit("train", "eval", pct=40, msg="epoch 4", loss=0.31)
Shell: python3 -m readout emit <job> <stage> [pct] [msg]
"""

import json
import re
import time

from .paths import data_dir

def emit(job, stage="", pct=None, msg="", **metrics):
    path = data_dir() / "jobs" / (re.sub(r"[^\w.-]", "_", job) + ".jsonl")
    path.parent.mkdir(parents=True, exist_ok=True)
    line = {"t": time.time(), "stage": stage, "pct": pct, "msg": msg, **metrics}
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")


def track(iterable, job, total=None, stage="run"):
    total = total if total is not None else (len(iterable) if hasattr(iterable, "__len__") else None)
    for i, item in enumerate(iterable, 1):
        yield item
        emit(job, stage, pct=round(100 * i / total, 1) if total else None, msg=f"{i}/{total or '?'}")
    emit(job, "done", pct=100)
