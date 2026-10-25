"""Prompt experiment example: same samples, schema and model; only the prompt changes between runs.

    PYTHONPATH=<repo>/src python3 examples/sentiment/run.py
    python3 -m readout compare sentiment-v1 sentiment-v2
Each call goes through `claude -p --model haiku`, so no API key is needed; it counts toward the account's usage.
"""

import json
import os
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

from readout import llm_call

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "claude-haiku-5-5"
SCHEMA = {"type": "string", "enum": ["긍정", "부정", "중립"]}
SAMPLES = [
    ("r01", "배송이 빨라서 좋아요", "긍정"), ("r02", "포장이 엉망이네요", "부정"), ("r03", "그냥 평범해요", "중립"),
    ("r04", "다신 안 삼", "부정"), ("r05", "가격은 비싸지만 품질은 만족해요", "중립"), ("r06", "생각보다 괜찮네요", "긍정"),
    ("r07", "배송은 빨랐는데 제품이 불량이에요", "중립"), ("r08", "별점 3개 드립니다", "중립"), ("r09", "최고예요 강추", "긍정"),
    ("r10", "환불 요청했습니다", "부정"),
]
# The headless sessions load the readout mod too; keep their session files out of the real dashboard.
ENV = {**os.environ, "READOUT_DIR": tempfile.mkdtemp()}


def ask(prompt, text):
    t0 = time.time()
    out = subprocess.run(["claude", "-p", "--model", "haiku", "--output-format", "json", f"{prompt}\n\n리뷰: {text}"],
                         capture_output=True, text=True, env=ENV, cwd=tempfile.gettempdir(), check=True)
    reply = json.loads(out.stdout)
    return reply["result"].strip(), reply.get("usage", {}), round((time.time() - t0) * 1000)


def run(name, prompt_path):
    prompt = open(prompt_path, encoding="utf-8").read()

    def one(sample):
        sid, text, gold = sample
        answer, usage, ms = ask(prompt, text)
        llm_call(name, sample_id=sid, input=text, output=answer, prompt=prompt, schema=SCHEMA, model=MODEL,
                 params={"via": "claude -p"}, usage={"output_tokens": usage.get("output_tokens")}, latency_ms=ms,
                 expected=gold, score=float(answer == gold), valid=answer in SCHEMA["enum"], prompt_path=prompt_path)
        print(name, sid, answer, gold, flush=True)

    with ThreadPoolExecutor(5) as pool:
        list(pool.map(one, SAMPLES))


if __name__ == "__main__":
    for name, path in (("sentiment-v1", "prompt_v1.md"), ("sentiment-v2", "prompt_v2.md")):
        run(name, os.path.join(HERE, path))
