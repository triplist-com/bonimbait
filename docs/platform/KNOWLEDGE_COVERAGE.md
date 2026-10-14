# Knowledge coverage: the whole channel in the AI advisor

The `knowledge` squad's run of 2026-10-14. It inventories the owner's YouTube channel, indexes every
video that has Hebrew captions, and measures what that does to retrieval. Raw data stays in the main
checkout's gitignored `data/`; the committed outputs are `apps/web/data/{search-index.*,videos.json}`.

<!-- NUMBERS -->

## How it was built

### 1. Inventory

- Flat listings of `/videos`, `/streams`, `/shorts`, `/podcasts` and all 40 playlists, fetched with
  `youtube:lang=iw` so titles come back in Hebrew rather than auto-translated.
- yt-dlp 2026.03.13 stopped paging playlists at 100 entries. Both the podcast playlist (116) and
  "מדריך הבניה" (224) were refetched with 2026.08.19, which pages correctly.
- Types: podcast (in the podcast playlist) > live (`/streams`) > short (`/shorts`) > video.
- Shorts and anything under 90 seconds stay out of the AI index.
- Flat listings carry no dates. Exact dates come from per-video metadata; the rest are interpolated
  from the newest-first tab order and flagged `upload_date_exact: false`.
- Output: `data/raw/channel_inventory.json` (one record per video, plus a summary block).

### 2. Captions

- One sequential extraction per video:
  `--skip-download --write-subs --write-auto-subs --sub-langs iw,he --sub-format json3`.
  No browser cookies, no media download.
- Manual Hebrew subtitles win over auto captions, with two exceptions:
  - A manual track under 300 characters (a title or "[מוזיקה]") falls back to the ASR track.
  - An auto track counts only when its speech recognition itself is Hebrew (`iw-orig`). A plain
    `iw` auto track can be a machine translation of another language's ASR.
- Pacing:
  - 1 s between requests and a random 9–13 s between videos, about 250 videos an hour (YouTube's
    guest limit is about 300).
  - On 429 or "confirm you're not a bot": back off exponentially (1, 2, 4 … 30 min), retry the same
    video, and stop after 6 blocks in a row.
  - The run is resumable from `data/raw/captions_status.json`.
- Queue order (the product priority):
  1. Podcasts and cost or budget episodes from 2023 on.
  2. Other 2025–2026 videos.
  3. Older series (old podcasts and cost episodes first, then videos on legacy `/video/` pages).
  4. Shorts.

### 3. Segments and embeddings

- **Segmentation:** captions become transcripts and then segments through the existing
  `scripts/transcribe/convert_subs.py` and `segment.py` functions, with the same 2–5 minute
  windows and 3-minute target as the first 178 videos.
- **Row text:** each index row is stored and embedded as `"<video title>\n<segment text>"`, the
  same convention as post chunks.
  - A 3-minute ASR window rarely names its topic; the title does.
  - Measured on the demo question, Ep. 109's ₪800K segment moved from cosine rank 275 to 34.
  - All 1,200 existing rows were re-embedded the same way for consistency.
  - `/api/search` snippets and the answer context strip the title line
    (`lib/knowledge/segment-text.ts`).
- **Marks:** rows carry `marks`, a list of `[char offset, second]` pairs about every 10 s,
  rebuilt from the caption lines. 100% of segments reconstruct exactly.
- **Embedding cache:** `data/processed/segment_embeddings.{keys.json,f32}`, keyed by text hash and
  seeded from the committed index. A rebuild only pays for new text.
- **Cost controls:** `--dry-run` estimates the cost with tiktoken (`cl100k_base`, the
  text-embedding-3-small tokenizer). The billed tokens matched the estimate exactly. `--max-cost`
  refuses to run over budget.

### 4. Catalog (`apps/web/data/videos.json`)

- **New records:** Hebrew title, duration, date, views and a `maxresdefault`/`hqdefault` thumbnail
  on `i.ytimg.com/vi/`. Also `kind` (video, podcast or live) and `chapters`.
  - Chapters come from yt-dlp, which parses them from the description; a parser for
    "0:00 title" lines is the fallback.
- **Descriptions:**
  - 211 of the first 213 descriptions were nothing but the channel's 18-line CTA template.
  - The "cleaned description" (template, timestamp, link and hashtag lines removed) is therefore
    almost always empty.
  - The summary comes from the AI pass below, or stays empty.
- **Category:** three free rules, in order:
  1. The owner's topical playlist (28 playlists mapped to the 8 existing categories).
  2. Title keywords. Cost words yield to any other topic.
  3. The nearest category centroid of segment embeddings, among the tied title categories (or
     all of them). Centroids are built from rule-labelled videos.
- **AI summaries** for the most important new videos (newest plus most viewed):
  - Model and pricing: Claude Haiku 5.5 (`claude-haiku-5-5`) through the Message Batches API at
    50%: $0.05 / $0.25 per MTok.
  - Each video gets a summary, 4–6 key points with the second each is discussed, the prices,
    tips and warnings stated in the video.
  - Output is schema-constrained JSON, and the 2026-03 summaries were left untouched.
- **Legacy pages:** they link to `/video/<id>/` ("סיכום AI עם חותמות זמן") whenever one of their
  `video_pages.youtube_ids` is in the catalog. That link is the "legacy page with AI coverage"
  counted above. The DB was only read.

### 5. Answer route and ranking (minimal edits)

- **`semantic.ts`** (two one-line fixes):
  - Geresh and gershayim (׳ ״) are treated like ASCII quotes in query terms. Before, "מ״ר"
    survived as a rare keyword with a huge IDF and pulled every article that spells it that way to
    the top.
  - Keyword-score ties are broken by cosine rather than by row order. Rows are alphabetical by
    YouTube id, so ties used to favour arbitrary videos such as `-Kg-k0VlTU0`.
  - `extractContentTerms` is now exported.
- **`/api/answer/stream`** uses `lib/knowledge/moments.ts`:
  - Each video segment sends Claude the 800-character window that matches the question. Before,
    only the first 800 characters were sent. For cost questions the window is price-aware.
  - The source plays from the second that passage is said, taken from `marks`, rather than from
    the 3-minute segment start.

## Run book

```bash
Y=/path/to/venv-with-yt-dlp-2026.08+   # pip install -U "yt-dlp[default]"; node or deno on PATH
P=scripts/.venv/bin/python

# 1. inventory (listings: see the docstring of scripts/knowledge/inventory.py)
$P -m scripts.knowledge.inventory
# 2. captions: polite, resumable, run in the background
$Y/bin/python -m scripts.knowledge.fetch_captions >> data/raw/captions_fetch.log 2>&1
# 3. segments, then embeddings (estimate first)
$P -m scripts.knowledge.build_segments
$P scripts/build_search_index.py --dry-run
$P scripts/build_search_index.py --embed-only --max-cost 0.50
# 4. catalog (rebuilt from the base revision, so every added record is re-decided)
$P -m scripts.knowledge.build_catalog --base feature/platform
$P -m scripts.knowledge.summarize --dry-run          # then without --dry-run (batch)
$P -m scripts.knowledge.build_catalog --base feature/platform   # merges the AI summaries
# 5. index
$P scripts/build_search_index.py
# 6. numbers, quality, load time
$P -m scripts.knowledge.coverage
node scripts/knowledge/quality/retrieval_check.mjs --root apps/web --cache data/processed/quality/query_embeddings.json --out after.json
$P -m scripts.knowledge.quality.score score scripts/knowledge/quality/judgments.json before.json after.json
node scripts/knowledge/quality/load_time.mjs --root apps/web --cache data/processed/quality/query_embeddings.json
# tests
$P -m unittest scripts.knowledge.test_catalog
```
