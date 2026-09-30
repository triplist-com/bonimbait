"""
Build the article (post) search index for the Next.js app.

Reads published posts from the Supabase `posts` table, splits each one into
overlapping plain-text chunks and embeds them with text-embedding-3-small.
Embeddings are cached by chunk hash in data/processed/post_embeddings.json, so
a re-run only pays for new or edited text.

Writes (row order of the .f32 matrix == order of the .json list):
  apps/web/data/posts-index.json — [{slug, title, chunk_index, text}, ...]
  apps/web/data/posts-index.f32  — packed Float32 matrix [N * 1536]

Usage:
  scripts/.venv/bin/python scripts/build_posts_index.py [--db URL] [--dry-run]

--db defaults to $INDEX_DATABASE_URL, then the local Supabase stack. The
hosted DB is reachable through the session pooler (see ENV_VARS.md).
"""
import argparse
import hashlib
import json
import os
import re
import struct
import time
from collections import Counter
from pathlib import Path
from urllib import request as urlreq

import psycopg
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps/web/data"
CACHE_PATH = ROOT / "data/processed/post_embeddings.json"
LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

MODEL = "text-embedding-3-small"
CHUNK_CHARS = 1500  # Hebrew is ~0.95 tokens/char, so ~1.4k tokens per chunk
OVERLAP_CHARS = 200
MIN_CHUNK_CHARS = 200  # a trailing fragment shorter than this is merged back
BATCH = 64
# Short paragraphs repeated in this many posts are sign-offs, phone numbers and
# CTA boxes ("תודה לכם קהילה יקרה", WhatsApp signup), not content.
BOILERPLATE_MIN_POSTS = 10
BOILERPLATE_MAX_CHARS = 150

BLOCK_TAGS = ["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "br", "blockquote", "section"]


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            if v.strip() and not os.environ.get(k.strip()):
                os.environ[k.strip()] = v.strip()


def html_to_paragraphs(html: str) -> list[str]:
    """Plain-text paragraphs, with scripts, styles and forms removed."""
    soup = BeautifulSoup(html or "", "html.parser")
    for el in soup(["script", "style", "form", "iframe", "noscript", "svg", "button"]):
        el.decompose()
    for el in soup.find_all(BLOCK_TAGS):
        el.insert_before("\n")
        el.insert_after("\n")
    text = soup.get_text(" ")
    paras = [re.sub(r"\s+", " ", p).strip() for p in text.split("\n")]
    return [p for p in paras if p]


def split_long(text: str, size: int) -> list[str]:
    """Split one oversized paragraph on sentence ends, then hard-cut."""
    parts = re.split(r"(?<=[.!?:])\s+", text)
    out, cur = [], ""
    for part in parts:
        while len(part) > size:
            out.append(part[:size])
            part = part[size:]
        if cur and len(cur) + 1 + len(part) > size:
            out.append(cur)
            cur = part
        else:
            cur = f"{cur} {part}".strip()
    if cur:
        out.append(cur)
    return out


def chunk_post(title: str, paragraphs: list[str]) -> list[str]:
    """Pack paragraphs into ~CHUNK_CHARS chunks, each prefixed with the title."""
    pieces: list[str] = []
    for p in paragraphs:
        pieces.extend(split_long(p, CHUNK_CHARS) if len(p) > CHUNK_CHARS else [p])

    chunks: list[str] = []
    cur = ""
    for piece in pieces:
        if cur and len(cur) + 1 + len(piece) > CHUNK_CHARS:
            chunks.append(cur)
            tail = cur[-OVERLAP_CHARS:]
            # Start the overlap on a word boundary.
            tail = tail[tail.find(" ") + 1 :] if " " in tail else tail
            cur = f"{tail} {piece}"
        else:
            cur = f"{cur}\n{piece}" if cur else piece
    if cur:
        if chunks and len(cur) < MIN_CHUNK_CHARS:
            chunks[-1] = f"{chunks[-1]}\n{cur}"
        else:
            chunks.append(cur)
    return [f"{title}\n{c}" for c in chunks]


def embed_batch(texts: list[str], key: str) -> list[list[float]]:
    body = json.dumps({"input": texts, "model": MODEL}).encode()
    req = urlreq.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urlreq.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return [item["embedding"] for item in sorted(data["data"], key=lambda d: d["index"])]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--dry-run", action="store_true", help="chunk and report cost, embed nothing")
    args = ap.parse_args()
    load_env()
    db_url = args.db or os.environ.get("INDEX_DATABASE_URL") or LOCAL_DB

    with psycopg.connect(db_url) as conn:
        rows = conn.execute(
            """
            select slug, title, content_html from posts
            where status = 'published' and coalesce(noindex, false) = false
            order by published_at desc nulls last, slug
            """
        ).fetchall()
    print(f"Published posts: {len(rows)}")

    paragraphs = {slug: html_to_paragraphs(html) for slug, _, html in rows}
    seen = Counter(p for paras in paragraphs.values() for p in set(paras))
    boilerplate = {p for p, n in seen.items() if n >= BOILERPLATE_MIN_POSTS and len(p) <= BOILERPLATE_MAX_CHARS}
    print(f"Boilerplate paragraphs dropped: {len(boilerplate)}")

    meta: list[dict] = []
    for slug, title, _ in rows:
        content = [p for p in paragraphs[slug] if p not in boilerplate]
        for i, text in enumerate(chunk_post(title, content)):
            meta.append({"slug": slug, "title": title, "chunk_index": i, "text": text})
    print(f"Chunks: {len(meta)} (avg {sum(len(m['text']) for m in meta) // max(1, len(meta))} chars)")

    cache: dict[str, list[float]] = json.loads(CACHE_PATH.read_text()) if CACHE_PATH.exists() else {}
    hashes = [hashlib.sha256(m["text"].encode()).hexdigest() for m in meta]
    missing = sorted({h: m["text"] for h, m in zip(hashes, meta) if h not in cache}.items())

    try:
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")
        tokens = sum(len(enc.encode(t)) for _, t in missing)
        print(f"To embed: {len(missing)} chunks, {tokens:,} tokens, ~${tokens / 1e6 * 0.02:.3f}")
    except ImportError:
        print(f"To embed: {len(missing)} chunks")
    if args.dry_run:
        return 0

    key = os.environ["OPENAI_API_KEY"]
    for i in range(0, len(missing), BATCH):
        batch = missing[i : i + BATCH]
        for attempt in range(4):
            try:
                vecs = embed_batch([t for _, t in batch], key)
                break
            except Exception as e:  # noqa: BLE001
                print(f"  batch {i} attempt {attempt} failed: {e}")
                time.sleep(2**attempt)
        else:
            raise RuntimeError(f"Batch {i} failed")
        for (h, _), v in zip(batch, vecs):
            cache[h] = v
        if (i // BATCH) % 10 == 0 or i + BATCH >= len(missing):
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            CACHE_PATH.write_text(json.dumps(cache))
            print(f"  embedded {min(i + BATCH, len(missing))}/{len(missing)}")

    (OUT_DIR / "posts-index.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    with open(OUT_DIR / "posts-index.f32", "wb") as f:
        for h in hashes:
            v = cache[h]
            f.write(struct.pack(f"<{len(v)}f", *v))
    for name in ("posts-index.json", "posts-index.f32"):
        print(f"Wrote {name} ({(OUT_DIR / name).stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
