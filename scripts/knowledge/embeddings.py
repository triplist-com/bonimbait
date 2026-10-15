"""OpenAI text-embedding-3-small helpers and the local segment-vector cache.

The cache (data/processed/segment_embeddings.{keys.json,f32}) maps the sha256
of the embedded text to its float32 vector, so re-runs only pay for new text.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from urllib import request as urlreq

import numpy as np

from scripts.knowledge.paths import WEB_DATA, processed_dir

MODEL = "text-embedding-3-small"
DIM = 1536
PRICE_PER_MTOK = 0.02
MAX_CHARS = 8000  # Hebrew is ~0.95 tokens/char; stays under the 8,191-token input limit
BATCH = 100


def text_key(text: str) -> str:
    import hashlib

    return hashlib.sha256(text[:MAX_CHARS].encode("utf-8")).hexdigest()


def video_titles(catalog_videos: list[dict]) -> dict[str, str]:
    """youtube_id -> title: the catalog's, else the fetched metadata's (stripped)."""
    from scripts.knowledge.paths import metadata_dir

    titles = {v["youtube_id"]: v["title"] for v in catalog_videos}
    for p in metadata_dir().glob("*.json"):
        if p.stem not in titles and p.stem != "channel_videos":
            titles[p.stem] = (json.loads(p.read_text(encoding="utf-8")).get("title") or "").strip()
    return titles


def row_text(title: str | None, segment_text: str) -> str:
    """Stored and embedded text of a video index row: "<title>\\n<segment text>" (like post chunks)."""
    return f"{title}\n{segment_text}" if title else segment_text


def uncaptioned_videos(segment_ids: set[str]) -> dict[str, dict]:
    """Long-form channel videos without segments: {id: metadata}.

    They get a title-level catalog record and index row (findable, no moments).
    Metadata comes from the per-video file, else the channel inventory listing.
    """
    from scripts.knowledge.paths import MIN_INDEX_SECONDS, captions_status_path, inventory_path, metadata_dir

    inventory = json.loads(inventory_path().read_text(encoding="utf-8"))["videos"]
    status = json.loads(captions_status_path().read_text(encoding="utf-8")) if captions_status_path().exists() else {}
    out: dict[str, dict] = {}
    for r in inventory:
        vid = r["id"]
        if not r.get("index_scope") or vid in segment_ids:
            continue
        if (status.get(vid) or {}).get("status") == "unavailable":
            continue
        p = metadata_dir() / f"{vid}.json"
        meta = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        title = (meta.get("title") or r.get("title") or "").strip()
        duration = meta.get("duration") or r.get("duration")
        if not title or title.startswith("youtube video #") or not duration or duration < MIN_INDEX_SECONDS:
            continue
        upload = meta.get("upload_date") or (r.get("upload_date") or "").replace("-", "")
        out[vid] = {**meta, "youtube_id": vid, "title": title, "duration": duration, "upload_date": upload}
    return out


class EmbeddingCache:
    """Append-only text-hash -> float32 vector store (keys JSON + raw f32 rows)."""

    def __init__(self, base: Path | None = None) -> None:
        base = base or processed_dir()
        self.keys_path = base / "segment_embeddings.keys.json"
        self.vecs_path = base / "segment_embeddings.f32"
        self.keys: list[str] = json.loads(self.keys_path.read_text()) if self.keys_path.exists() else []
        if self.vecs_path.exists():
            self.vecs = np.fromfile(self.vecs_path, dtype="<f4").reshape(-1, DIM)
        else:
            self.vecs = np.zeros((0, DIM), dtype="<f4")
        if len(self.keys) != len(self.vecs):
            raise RuntimeError(f"cache mismatch: {len(self.keys)} keys, {len(self.vecs)} rows")
        self.row = {k: i for i, k in enumerate(self.keys)}
        self.pending_keys: list[str] = []
        self.pending_vecs: list[np.ndarray] = []

    def __len__(self) -> int:
        return len(self.keys) + len(self.pending_keys)

    def __contains__(self, key: str) -> bool:
        return key in self.row

    def get(self, key: str) -> np.ndarray:
        i = self.row[key]
        if i < len(self.vecs):
            return self.vecs[i]
        return self.pending_vecs[i - len(self.vecs)]

    def add(self, key: str, vec) -> None:
        if key in self.row:
            return
        self.row[key] = len(self)
        self.pending_keys.append(key)
        self.pending_vecs.append(np.asarray(vec, dtype="<f4"))

    def save(self) -> None:
        if not self.pending_keys:
            return
        self.vecs_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.vecs_path, "ab") as f:
            np.stack(self.pending_vecs).astype("<f4").tofile(f)
        self.keys.extend(self.pending_keys)
        self.keys_path.write_text(json.dumps(self.keys))
        self.vecs = np.fromfile(self.vecs_path, dtype="<f4").reshape(-1, DIM)
        self.pending_keys, self.pending_vecs = [], []

    def seed_from_index(self, meta_path: Path = WEB_DATA / "search-index.json", vec_path: Path = WEB_DATA / "search-index.f32") -> int:
        """Reuse the vectors of a committed index (no API calls). Returns rows added."""
        if not (meta_path.exists() and vec_path.exists()):
            return 0
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        vecs = np.fromfile(vec_path, dtype="<f4").reshape(-1, DIM)
        if len(meta) != len(vecs):
            raise RuntimeError(f"index mismatch: {len(meta)} rows vs {len(vecs)} vectors")
        before = len(self)
        for m, v in zip(meta, vecs):
            self.add(text_key(m["text"]), v)
        self.save()
        return len(self) - before


def count_tokens(texts: list[str]) -> int:
    try:
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")
        return sum(len(enc.encode(t[:MAX_CHARS])) for t in texts)
    except ImportError:  # rough Hebrew estimate
        return int(sum(len(t[:MAX_CHARS]) for t in texts) * 0.95)


def embed_batch(texts: list[str], api_key: str) -> tuple[list[list[float]], int]:
    """One embeddings request. Returns (vectors in input order, billed tokens)."""
    body = json.dumps({"input": [t[:MAX_CHARS] for t in texts], "model": MODEL}).encode()
    req = urlreq.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urlreq.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    vecs = [item["embedding"] for item in sorted(data["data"], key=lambda d: d["index"])]
    return vecs, int(data.get("usage", {}).get("total_tokens", 0))


def embed_missing(cache: EmbeddingCache, texts: dict[str, str], api_key: str, log=print) -> int:
    """Embed {key: text} not yet cached, saving after every batch. Returns billed tokens."""
    items = [(k, t) for k, t in texts.items() if k not in cache]
    used_tokens = 0
    for i in range(0, len(items), BATCH):
        chunk = items[i : i + BATCH]
        for attempt in range(4):
            try:
                vecs, used = embed_batch([t for _, t in chunk], api_key)
                break
            except Exception as e:  # noqa: BLE001
                log(f"  batch {i} attempt {attempt} failed: {e}")
                time.sleep(2**attempt)
        else:
            cache.save()
            raise RuntimeError(f"Batch {i} failed")
        used_tokens += used
        for (k, _), v in zip(chunk, vecs):
            cache.add(k, v)
        cache.save()
        log(f"  embedded {min(i + BATCH, len(items))}/{len(items)}")
    return used_tokens


def unit(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n else v
