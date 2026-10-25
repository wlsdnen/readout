# readout

[English](README.md) | 한국어

Claude Code가 일하는 동안 무엇을 하고 있는지 실시간으로 보고, 끝난 작업은 몇 초 만에 읽히는 결과 카드로 돌려받습니다.

- **실시간 보기**: 채팅 옆 패널과 로컬 대시보드에 main과 모든 서브에이전트(지금 쓰는 도구, 도구 사용 횟수, 경과 시간), 그리고 직접 돌리는 작업(학습, LLM 배치, 스크립트)의 진행률과 스파크라인이 나옵니다.
- **결과 카드**: 파일을 고친 턴마다 카드가 자동으로 생깁니다. Claude는 여기에 해석을 더한 카드를 씁니다. 한 줄 결론, 전/후 비교, 개선·악화·판단 보류(차이가 신뢰구간 안일 때)로 판정한 지표, 샘플, 주장별 확인 상태, 다음 할 일, 재현 정보가 들어갑니다.
- **LLM 실험**: 호출마다 입력, 프롬프트, 스키마, 모델, 출력을 기록합니다. 두 실행을 비교하면 네 가지 중 무엇이 바뀌었는지, 프롬프트와 스키마의 차이, 공통 샘플의 지표, 출력이 달라진 샘플을 보여줍니다.
- **쓰면서 늘어나는 카드 종류**: 기본 7종(change, experiment, data, performance, investigation, failure, retrospective)이 있습니다. 맞는 종류가 없으면 Claude가 새 형식을 제안하고, 채택할지는 사용자가 정합니다.

## 설치

Claude Code 터미널 세션의 입력창에서:

```
/plugin install readout --marketplace wlsdnen/readout
```

셸에서는 `claude plugin install readout --marketplace wlsdnen/readout`입니다. 로컬에 클론했다면 `claude plugin marketplace add <클론 경로>` 후 `claude plugin install readout@readout`을 실행합니다.

세션이 시작되면 대시보드가 http://localhost:8765 에 열립니다. 아무 브라우저나 Orca 내장 브라우저로 보면 됩니다. `/readout`은 패널을 다시 열고, `/readout:explain`은 결과 카드를 바로 만듭니다.

macOS나 Linux, 그리고 PATH에 `python3`가 필요합니다.

## 설정

`/config`의 readout 항목에서 바꿉니다.

| 설정 | 기본값 | 하는 일 |
|---|---|---|
| Dashboard port | 8765 | 로컬 대시보드 포트. 127.0.0.1에만 열립니다 |
| Tunnel host | 비어 있음 | 브라우저가 다른 컴퓨터에 있을 때, 그 컴퓨터의 localhost에서 이 대시보드가 열리게 할 ssh 호스트 (`ssh -R`, 키 인증 필요) |
| Visual-first reporting | 켜짐 | 끝난 작업을 결과 카드로 보고하라는 짧은 지시를 시스템 프롬프트에 추가 |

다른 plugin이 plugin들의 시스템 프롬프트 섹션을 건너뛰게 하는 환경에서는 Visual-first reporting이 적용되지 않습니다. 디버그 로그에 `readout: prompt.compose bypassed by <plugin>`이 보이면 이 경우입니다. 이때는 CLAUDE.md에 같은 지시를 직접 넣으세요. 예: "When reporting finished work, follow the `readout:explain` skill."

데이터는 `$READOUT_DIR`, 없으면 `~/.claude/readout`에 저장됩니다. 그 안에 `cards/`, `jobs/`, `runs/`, `blobs/`, `sessions/`, 그리고 사용자가 만든 `card-types/`가 있습니다.

## 내 코드에서 진행률과 결과 보내기

```sh
pip install "git+https://github.com/wlsdnen/readout"    # 또는: pip install -e <클론 경로>
```

```python
from readout import track, emit, llm_call

for batch in track(loader, "train"):            # 진행률 바와 퍼센트
    ...
emit("train", "eval", pct=40, msg="epoch 4", loss=0.31)   # 숫자 필드는 스파크라인이 됩니다

llm_call("cls-v2", sample_id=s.id, input=s.text, output=out, prompt=PROMPT, schema=SCHEMA,
         model="claude-sonnet-5-5", params={"temperature": 0}, expected=s.label, score=float(out == s.label))
```

셸에서는 `python3 -m readout emit <job> <stage> [pct] [msg]`입니다. 두 LLM 실행을 비교하려면 `python3 -m readout compare <기준 실행> <새 실행>`을 씁니다. 프롬프트 실험 전체 예시는 `examples/sentiment/`에 있습니다.

## 구성

| 경로 | 내용 |
|---|---|
| `.claude-plugin/` | plugin manifest(설정 항목)와 marketplace 항목 |
| `hooks/register.tsx` | mod: 에이전트와 도구 호출 추적, 자동 카드 작성, 패널 표시, 대시보드 제공 |
| `hooks/visual-first.md` | Visual-first reporting이 켜져 있을 때 시스템 프롬프트에 넣는 섹션 |
| `skills/explain/` | Claude가 끝난 작업을 카드로 만드는 방법 |
| `card-types/` | 기본 카드 종류와 새 종류를 추가하는 규칙 |
| `dashboard/index.html` | 대시보드: 진행 상황 띠, 카드 목록, 카드 상세 |
| `src/readout/` | Python 패키지: 진행률, 카드, LLM 기록, 실행 비교, CLI |

## 개발

```sh
PYTHONPATH=src python3 -m unittest discover -s tests
claude plugin validate . && claude plugin test .
```

`claude --plugin-dir .`로 작업 중인 폴더를 그대로 로드한 세션을 열 수 있습니다.

## 라이선스

MIT
