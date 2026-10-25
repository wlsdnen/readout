"""Build an experiment card comparing two LLM runs logged by readout.llm_call.

    python3 -m readout compare <baseline run> <new run> [--title TITLE]
Prints the saved card id. The card holds the four axes, prompt/schema diffs, metrics on the shared samples
and the samples whose output changed; verdict and interpretation are left for whoever reads it to fill.
"""

import json
import math
import os
import statistics

from .cards import add_block, diff_block, new_card
from .llm_log import load_run, read_blob

SAMPLES_SHOWN = 50
Z95 = 1.96


def _one(calls, key):
    values = {json.dumps(c[key], sort_keys=True) for c in calls}
    return json.loads(values.pop()) if len(values) == 1 else "(섞여 있음)"


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.fmean(xs), 4) if xs else None


def _paired_ci(pairs):
    """95% half-width of the mean of per-sample differences; None below two pairs."""
    diffs = [b - a for a, b in pairs]
    if len(diffs) < 2:
        return None
    return round(Z95 * statistics.stdev(diffs) / math.sqrt(len(diffs)), 4)


def build(run_a, run_b, title=None):
    meta_a, calls_a = load_run(run_a)
    meta_b, calls_b = load_run(run_b)
    by_a = {c["sample_id"]: c for c in calls_a}
    by_b = {c["sample_id"]: c for c in calls_b}
    shared = [s for s in by_a if s in by_b]

    inputs_same = set(by_a) == set(by_b) and all(by_a[s]["input_sha"] == by_b[s]["input_sha"] for s in shared)
    axes = [
        {"name": "입력 데이터", "changed": not inputs_same,
         "before": f"{len(by_a)}건", "after": f"{len(by_b)}건 (공통 {len(shared)})"},
        {"name": "프롬프트", "changed": _one(calls_a, "prompt_sha") != _one(calls_b, "prompt_sha"),
         "before": os.path.basename(meta_a.get("prompt_path") or ""), "after": os.path.basename(meta_b.get("prompt_path") or "")},
        {"name": "스키마", "changed": _one(calls_a, "schema_sha") != _one(calls_b, "schema_sha")},
        {"name": "모델·설정", "changed": (_one(calls_a, "model"), _one(calls_a, "params")) != (_one(calls_b, "model"), _one(calls_b, "params")),
         "before": f"{_one(calls_a, 'model')} {json.dumps(_one(calls_a, 'params'), ensure_ascii=False)}",
         "after": f"{_one(calls_b, 'model')} {json.dumps(_one(calls_b, 'params'), ensure_ascii=False)}"},
    ]

    card = new_card("experiment", title or f"{run_b} vs {run_a}", baseline=run_a,
                    repro={"command": f"python3 -m readout compare {run_a} {run_b}", "commit": meta_b.get("commit")})
    add_block(card, "axes", "무엇이 바뀌었나", axes=axes)
    for name, key in (("프롬프트", "prompt_sha"), ("스키마", "schema_sha")):
        sha_a, sha_b = _one(calls_a, key), _one(calls_b, key)
        if sha_a != sha_b and "(섞여 있음)" not in (sha_a, sha_b):
            diff_block(card, read_blob(sha_a), read_blob(sha_b), f"{name} 변경", (run_a, run_b))

    scored = [(by_a[s]["score"], by_b[s]["score"]) for s in shared
              if by_a[s]["score"] is not None and by_b[s]["score"] is not None]
    rows = []
    if scored:
        rows.append({"name": "점수 평균", "before": _mean([a for a, _ in scored]), "after": _mean([b for _, b in scored]),
                     "better": "up", "n": len(scored), "ci": _paired_ci(scored)})
    for name, get, better in (
        ("스키마 통과율", lambda c: None if c["valid"] is None else float(c["valid"]), "up"),
        ("출력 토큰", lambda c: c["usage"].get("output_tokens"), "down"),
        ("지연(ms)", lambda c: c["latency_ms"], "down"),
    ):
        before, after = _mean([get(by_a[s]) for s in shared]), _mean([get(by_b[s]) for s in shared])
        if before is not None or after is not None:
            rows.append({"name": name, "before": before, "after": after, "better": better, "n": len(shared)})
    if rows:
        add_block(card, "metrics", f"공통 샘플 {len(shared)}건 기준", rows=rows)

    def tag(s):
        a, b = by_a[s]["score"], by_b[s]["score"]
        if a is None or b is None or a == b:
            return "changed"
        return "improved" if b > a else "regressed"

    changed = [s for s in shared if by_a[s]["output"] != by_b[s]["output"]]
    order = {"regressed": 0, "improved": 1, "changed": 2}
    changed.sort(key=lambda s: order[tag(s)])
    add_block(card, "samples", f"출력이 달라진 샘플 {len(changed)}/{len(shared)}건", labels=[run_a, run_b], rows=[
        {"id": s, "input": by_b[s]["input"], "a": by_a[s]["output"], "b": by_b[s]["output"],
         "expected": by_b[s]["expected"], "tag": tag(s)}
        for s in changed[:SAMPLES_SHOWN]
    ])
    if sum(a["changed"] for a in axes) > 1:
        card["confidence"].append({"claim": "두 가지 이상이 동시에 바뀌어 원인을 하나로 특정할 수 없음", "level": "unverified"})
    return card
