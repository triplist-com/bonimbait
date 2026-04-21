"""
Build unified segment-level search index for the Next.js app.

Reads:
  data/processed/segments/*.json   — all 179 videos
  data/processed/embeddings/*.json — 50 already embedded
  apps/web/data/videos.json        — for title/thumbnail/category metadata

Embeds missing segments via OpenAI text-embedding-3-small.

Writes:
  apps/web/data/search-index.json — [{youtube_id, segment_index, start_time, end_time, text}, ...]
  apps/web/data/search-index.f32  — packed Float32 matrix [N * 1536]
"""
import json, os, sys, struct, time
from pathlib import Path
from urllib import request as urlreq

ROOT = Path("/Users/drorkashi/Projects/bonimbayit")
SEG_DIR = ROOT / "data/processed/segments"
EMB_DIR = ROOT / "data/processed/embeddings"
OUT_DIR = ROOT / "apps/web/data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Load env
env_path = ROOT / ".env"
for line in env_path.read_text().splitlines():
    if line.startswith("OPENAI_API_KEY="):
        os.environ["OPENAI_API_KEY"] = line.split("=", 1)[1].strip()

OPENAI_KEY = os.environ["OPENAI_API_KEY"]

# Load videos.json to filter to videos that exist in the frontend corpus
videos_json = json.loads((OUT_DIR / "videos.json").read_text())
valid_ids = {v["youtube_id"] for v in videos_json["videos"]}
print(f"Frontend corpus: {len(valid_ids)} videos")

# Load existing embeddings keyed by (youtube_id, segment_index) -> vector
existing = {}
for f in EMB_DIR.glob("*.json"):
    d = json.loads(f.read_text())
    yt = d["youtube_id"]
    for item in d["embeddings"]:
        if item.get("content_type") != "segment":
            continue
        existing[(yt, item["segment_index"])] = item["embedding"]
print(f"Existing embeddings: {len(existing)} segments across {len(set(k[0] for k in existing))} videos")

# Gather all segments for videos in corpus
all_segments = []
missing = []
for f in sorted(SEG_DIR.glob("*.json")):
    d = json.loads(f.read_text())
    if isinstance(d, list):
        yt = f.stem
        segs = d
    else:
        yt = d.get("youtube_id") or f.stem
        segs = d.get("segments", [])
    if yt not in valid_ids:
        continue
    for seg in segs:
        entry = {
            "youtube_id": yt,
            "segment_index": seg["segment_index"],
            "start_time": seg["start_time"],
            "end_time": seg["end_time"],
            "text": seg["text"],
        }
        all_segments.append(entry)
        if (yt, seg["segment_index"]) not in existing:
            missing.append(entry)

print(f"Total segments for corpus: {len(all_segments)}")
print(f"Missing embeddings: {len(missing)}")

# Embed missing in batches of 100
def embed_batch(texts):
    # Truncate each to ~8000 chars to stay under token limit
    texts = [t[:8000] for t in texts]
    body = json.dumps({"input": texts, "model": "text-embedding-3-small"}).encode()
    req = urlreq.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urlreq.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return [item["embedding"] for item in data["data"]]

BATCH = 100
for i in range(0, len(missing), BATCH):
    chunk = missing[i : i + BATCH]
    for attempt in range(3):
        try:
            vecs = embed_batch([c["text"] for c in chunk])
            break
        except Exception as e:
            print(f"  batch {i} attempt {attempt} failed: {e}")
            time.sleep(2 ** attempt)
    else:
        raise RuntimeError(f"Batch {i} failed")
    for c, v in zip(chunk, vecs):
        existing[(c["youtube_id"], c["segment_index"])] = v
    print(f"  embedded {i + len(chunk)}/{len(missing)}")

# Write output: segments metadata in same order as matrix
print("Writing output files...")
meta = []
vectors = []
for s in all_segments:
    key = (s["youtube_id"], s["segment_index"])
    v = existing.get(key)
    if v is None:
        continue
    meta.append(s)
    vectors.append(v)

print(f"Final: {len(meta)} segments with embeddings")

(OUT_DIR / "search-index.json").write_text(
    json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
)

# Pack float32 matrix, row-major
with open(OUT_DIR / "search-index.f32", "wb") as f:
    for v in vectors:
        f.write(struct.pack(f"<{len(v)}f", *v))

print(f"Wrote search-index.json ({(OUT_DIR / 'search-index.json').stat().st_size / 1e6:.1f} MB)")
print(f"Wrote search-index.f32 ({(OUT_DIR / 'search-index.f32').stat().st_size / 1e6:.1f} MB)")
print(f"Matrix shape: {len(vectors)} x {len(vectors[0]) if vectors else 0}")
