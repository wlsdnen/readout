"""python3 -m readout emit <job> <stage> [pct] [msg] | compare <baseline> <new> [--title T] | validate <card.json>"""

import argparse
import json
import sys
from pathlib import Path

from .cards import save, validate
from .compare import build
from .progress import emit


def main(argv=None):
    parser = argparse.ArgumentParser(prog="readout", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p_emit = sub.add_parser("emit", help="append one progress event for a job")
    p_emit.add_argument("job")
    p_emit.add_argument("stage")
    p_emit.add_argument("pct", nargs="?", type=float)
    p_emit.add_argument("msg", nargs="*")
    p_cmp = sub.add_parser("compare", help="write an experiment card comparing two logged LLM runs")
    p_cmp.add_argument("baseline")
    p_cmp.add_argument("new")
    p_cmp.add_argument("--title")
    p_val = sub.add_parser("validate", help="check a card file against the block kinds")
    p_val.add_argument("card", type=Path)
    args = parser.parse_args(argv)

    if args.command == "emit":
        emit(args.job, args.stage, pct=args.pct, msg=" ".join(args.msg))
    elif args.command == "compare":
        print(save(build(args.baseline, args.new, args.title)).stem)
    else:
        problems = validate(json.loads(args.card.read_text(encoding="utf-8")))
        print("\n".join(problems) or "OK")
        return 1 if problems else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
