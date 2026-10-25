"""Result cards: <monitor dir>/cards/<id>.json, drawn by dashboard/index.html.

A card is a fixed skeleton plus an ordered list of blocks; card-types/*.md say which blocks a type fills.

    from readout import new_card, add_block, diff_block, save
    c = new_card("change", "로그인 캐시", verdict="지연 1.2초 → 0.3초")
    add_block(c, "metrics", rows=[{"name": "p95", "before": 1.2, "after": 0.3, "unit": "s", "better": "down"}])
    save(c)
CLI: python3 -m readout validate <file>
"""

import difflib
import json
import re
import secrets
import time
from pathlib import Path

from .paths import data_dir

STATUSES = {"success", "partial", "failed"}
LEVELS = {"verified", "estimated", "unverified"}
# kind -> fields a block of that kind must carry
KINDS = {
    "text": ["text"],
    "compare": ["before", "after"],
    "diff": ["unified"],
    "metrics": ["rows"],
    "chart": ["series"],
    "samples": ["rows"],
    "gallery": ["items"],
    "files": ["rows"],
    "timeline": ["agents"],
    "axes": ["axes"],
    "embed": ["src"],
    "checklist": ["items"],
}


def cards_dir():
    return data_dir() / "cards"


def new_card(type, title, *, status="success", verdict="", project=None, unexpected=False, **extra):
    now = time.time()
    slug = re.sub(r"[^\w-]+", "-", title.lower()).strip("-")[:40] or "card"
    return {
        "id": f"{time.strftime('%Y%m%d-%H%M%S')}-{slug}-{secrets.token_hex(2)}",
        "type": type,
        "title": title,
        "status": status,
        "verdict": verdict,
        "unexpected": unexpected,
        "project": project or str(Path.cwd()),
        "createdAt": now,
        "updatedAt": now,
        "blocks": [],
        "confidence": [],
        "next": [],
        "repro": {},
        **extra,
    }


def add_block(card, kind, title=None, **fields):
    block = {"kind": kind, **({"title": title} if title else {}), **fields}
    errors = _block_errors(block)
    if errors:
        raise ValueError("; ".join(errors))
    card["blocks"].append(block)
    return block


def diff_block(card, before, after, title=None, labels=("before", "after")):
    unified = "\n".join(
        difflib.unified_diff(before.splitlines(), after.splitlines(), labels[0], labels[1], lineterm="")
    )
    return add_block(card, "diff", title, unified=unified or "(변경 없음)")


def asset_dir(card):
    path = cards_dir() / card["id"]
    path.mkdir(parents=True, exist_ok=True)
    return path


def _block_errors(block):
    kind = block.get("kind")
    if kind not in KINDS:
        return [f"unknown block kind {kind!r}; known: {', '.join(KINDS)}"]
    return [f"{kind} block needs {f!r}" for f in KINDS[kind] if f not in block]


def validate(card):
    errors = [f"missing {k!r}" for k in ("id", "type", "title", "status", "verdict", "blocks") if k not in card]
    if card.get("status") not in STATUSES:
        errors.append(f"status must be one of {sorted(STATUSES)}")
    for i, block in enumerate(card.get("blocks", [])):
        errors += [f"block {i}: {e}" for e in _block_errors(block)]
    for c in card.get("confidence", []):
        if c.get("level") not in LEVELS:
            errors.append(f"confidence level must be one of {sorted(LEVELS)}: {c}")
    return errors


def save(card):
    errors = validate(card)
    if errors:
        raise ValueError("invalid card: " + "; ".join(errors))
    card["updatedAt"] = time.time()
    path = cards_dir() / f"{card['id']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(card, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)  # the dashboard and the mod never read a half-written card
    return path
