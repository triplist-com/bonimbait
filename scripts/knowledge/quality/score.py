"""Blind judging sheet and scores for the retrieval quality check.

Rubric per (question, document) in the top 5 the answer route would use:
  2 = answers the question directly (the content a builder needs is there)
  1 = on the topic, partly useful
  0 = off topic

  # 1. one sheet with every unique (question, document) of all runs, run labels hidden
  scripts/.venv/bin/python -m scripts.knowledge.quality.score sheet before.json after.json > sheet.txt
  # 2. write judgments.json: {"q01": {"v:<youtube id>": 2, "p:<slug>": 0, ...}, ...}
  # 3. scores per run
  scripts/.venv/bin/python -m scripts.knowledge.quality.score score judgments.json before.json after.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sheet(runs: list[str]) -> None:
    data = [load(p) for p in runs]
    for qi, q in enumerate(data[0]["results"]):
        docs: dict[str, dict] = {}
        for d in data:
            for doc in d["results"][qi]["answer"]:
                docs.setdefault(doc["key"], doc)
        print(f"\n## {q['id']} [{q['topic']}] {q['q']}")
        for key in sorted(docs):  # sorted keys: no hint of which run ranked what
            doc = docs[key]
            body = doc["text"].split("\n", 1)[-1] if doc["kind"] == "video" else doc["text"].split("\n", 1)[-1]
            print(f"- {key} | {doc['title'][:90]}\n    {body[:260].replace(chr(10), ' ')}")


def score(judgments_path: str, runs: list[str]) -> None:
    judged = load(judgments_path)
    base_videos = None
    rows = []
    for path in runs:
        d = load(path)
        index_ids = None
        total = rel1 = rel2 = n = 0
        video_total = video_n = 0
        new_relevant_q = 0
        missing = 0
        for r in d["results"]:
            got = judged.get(r["id"], {})
            q_new = False
            for doc in r["answer"]:
                if doc["key"] not in got:
                    missing += 1
                    continue
                s = got[doc["key"]]
                n += 1
                total += s
                rel1 += s >= 1
                rel2 += s >= 2
                if doc["kind"] == "video":
                    video_n += 1
                    video_total += s
                    if base_videos is not None and doc["key"][2:] not in base_videos and s >= 1:
                        q_new = True
            new_relevant_q += q_new
        if base_videos is None:
            base_videos = {doc["key"][2:] for r in d["results"] for doc in r["answer"] if doc["kind"] == "video"}
            base_videos |= set(load_index_ids(d))
        rows.append(
            {
                "run": Path(path).stem,
                "index_videos": d.get("index_videos"),
                "mean_score_top5": round(total / len(d["results"]), 2),
                "precision_at_5": round(rel1 / max(n, 1), 3),
                "strongly_relevant_at_5": round(rel2 / max(n, 1), 3),
                "video_docs": video_n,
                "video_doc_mean": round(video_total / max(video_n, 1), 2),
                "questions_with_a_relevant_new_video": new_relevant_q,
                "unjudged": missing,
            }
        )
    print(json.dumps(rows, ensure_ascii=False, indent=1))


def load_index_ids(result: dict) -> list[str]:
    """YouTube ids of the run's index (the before run defines 'new')."""
    root = Path(result["root"]) / "data" / "search-index.json"
    if not root.exists():
        return []
    return list({r["youtube_id"] for r in json.loads(root.read_text(encoding="utf-8"))})


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:]
    if cmd == "sheet":
        sheet(rest)
    elif cmd == "score":
        score(rest[0], rest[1:])
    else:
        raise SystemExit(__doc__)
