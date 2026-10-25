import json
import os
import tempfile
import unittest
from pathlib import Path

from readout import add_block, diff_block, emit, llm_call, new_card, pin_baseline, save, track, validate
from readout.__main__ import main
from readout.compare import build
from readout.llm_log import load_run, read_blob


class DataDirTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.env = os.environ.get("READOUT_DIR")
        os.environ["READOUT_DIR"] = str(self.dir)

    def tearDown(self):
        if self.env is None:
            os.environ.pop("READOUT_DIR")
        else:
            os.environ["READOUT_DIR"] = self.env

    def lines(self, rel):
        return [json.loads(x) for x in (self.dir / rel).read_text(encoding="utf-8").splitlines()]


class ProgressTest(DataDirTest):
    def test_track_reports_each_step_then_done(self):
        list(track(range(3), "a/b"))
        emit("a/b", "eval", msg="한글", loss=0.5)
        rows = self.lines("jobs/a_b.jsonl")
        self.assertEqual([r["pct"] for r in rows[:4]], [33.3, 66.7, 100.0, 100])
        self.assertEqual((rows[-1]["msg"], rows[-1]["loss"]), ("한글", 0.5))

    def test_cli_emit(self):
        main(["emit", "job", "stage", "40", "epoch", "4"])
        self.assertEqual(self.lines("jobs/job.jsonl")[0]["msg"], "epoch 4")


class CardsTest(DataDirTest):
    def test_save_and_validate(self):
        c = new_card("change", "캐시 추가", verdict="p95 1.2s → 0.3s")
        add_block(c, "metrics", rows=[{"name": "p95", "before": 1.2, "after": 0.3, "better": "down"}])
        c["confidence"].append({"claim": "p95 개선", "level": "verified"})
        saved = json.loads(save(c).read_text(encoding="utf-8"))
        self.assertEqual(saved["title"], "캐시 추가")
        self.assertEqual(validate(saved), [])
        self.assertTrue(validate({**c, "status": "ok"}))
        with self.assertRaises(ValueError):
            add_block(c, "nope")

    def test_diff_without_trailing_newline_keeps_lines_apart(self):
        c = new_card("change", "t")
        self.assertEqual(diff_block(c, "x", "y")["unified"].splitlines()[-2:], ["-x", "+y"])


class LlmTest(DataDirTest):
    def log(self, run, prompt, answers):
        data = [("s1", "좋아요", "긍정"), ("s2", "별로", "부정"), ("s3", "그냥 그래", "중립")]
        for (sid, text, gold), out in zip(data, answers):
            llm_call(run, sample_id=sid, input=text, output=out, prompt=prompt, model="m", expected=gold,
                     score=float(out == gold), usage={"output_tokens": 5}, prompt_path=f"/x/{run}.md")

    def test_blobs_are_stored_once(self):
        self.log("r1", "분류하라", ["긍정", "긍정", "긍정"])
        meta, calls = load_run("r1")
        self.assertEqual((meta["run"], len(calls)), ("r1", 3))
        self.assertEqual(len(list((self.dir / "blobs").iterdir())), 4)  # 3 inputs + 1 prompt
        self.assertEqual(read_blob(calls[0]["prompt_sha"]), "분류하라")
        pin_baseline("/p", "r1")
        self.assertEqual(json.loads((self.dir / "baselines.json").read_text())["/p"], "r1")

    def test_compare_isolates_the_prompt_axis(self):
        self.log("v1", "분류하라", ["긍정", "긍정", "긍정"])
        self.log("v2", "세 가지로 분류하라", ["긍정", "부정", "중립"])
        card = build("v1", "v2")
        self.assertEqual([b["kind"] for b in card["blocks"]], ["axes", "diff", "metrics", "samples"])
        self.assertEqual([a["changed"] for a in card["blocks"][0]["axes"]], [False, True, False, False])
        self.assertEqual(card["blocks"][0]["axes"][1]["after"], "v2.md")
        score = card["blocks"][2]["rows"][0]
        self.assertEqual((score["before"], score["after"], score["n"]), (0.3333, 1.0, 3))
        self.assertEqual([r["tag"] for r in card["blocks"][3]["rows"]], ["improved", "improved"])
        self.assertEqual(card["confidence"], [])
        self.assertEqual(validate(card), [])


if __name__ == "__main__":
    unittest.main()
