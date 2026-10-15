# Knowledge coverage: the whole channel in the AI advisor

The `knowledge` squad's run of 2026-10-14/15. It inventories the owner's YouTube channel, indexes every
video that has Hebrew captions, gives every other video a title-level entry, and measures what that
does to retrieval. Raw data stays in the main checkout's gitignored `data/`; the committed outputs
are `apps/web/data/{search-index.*,videos.json}`.

## Headline

- **The channel:** 994 uploads, 316.0 hours. In scope for the AI index (90 s and over, available, not
  a superseded copy) are **951 videos, 312.5 hours**: 824 videos, 113 podcast episodes and 14 live
  streams.
- **What the AI advisor knows:** the full transcripts of **278 of 951 videos (29%), 89.8 of 312.5
  hours (29%)**, as 1,774 segments with second-level moments. That's up from 178 videos, 61.2 hours
  and 1,200 segments (19%).
- **What it can find:** all 951. The other 673 videos (222.7 h) have no Hebrew captions on YouTube.
  Each has a title-level entry: it shows up in search and as a related video, but has no moments.
- **Legacy pages:** 80 of the 188 legacy `/video/<slug>/` pages now link to an AI summary with
  timestamps, up from 37.
- **For the pitch:**
  - Suggested line: "The AI advisor has the transcripts of 278 of the channel's 951 videos (90 of
    313 hours) and finds all 951."
  - The pitch's "~900 videos / 450 hours" overstates the hours. The whole channel, shorts included,
    is 316 hours.
- **Owner action (free, likely the biggest win):** set the video language to Hebrew on the old
  uploads (see [Why 673 videos have no captions](#why-673-videos-have-no-captions)).

## Coverage, before and after

| | Before (2026-03 index) | After | Change |
|---|---:|---:|---:|
| Videos with transcripts in the AI index | 178 | **278** | +100 |
| … of the 951 long-form videos | 19% | **29%** | |
| Hours with transcripts | 61.2 h | **89.8 h** | +28.6 h |
| … of 312.5 long-form hours | 20% | **29%** | |
| Transcript segments (all with second marks) | 1,200 | **1,774** | +574 |
| Title-level entries (no captions; findable, no moments) | 0 | **673** (222.7 h) | +673 |
| Videos findable in search and as related videos | 178 | **951** (100%) | +773 |
| Catalog records (`videos.json`, `/video/<id>/` pages) | 200 | **951** | +751 |
| Article chunks (unchanged) | 5,233 | 5,233 (714 posts) | |
| Legacy `/video/<slug>/` pages with AI coverage (of 188) | 37 | **80** | +43 |
| … published ones (of 185) | 36 | 79 | +43 |

By type (in scope):

| Type | In scope | Hours | With transcripts | Hours | Title-level |
|---|---:|---:|---:|---:|---:|
| Videos | 824 | 210.1 | 234 | 53.7 | 590 |
| Podcast episodes | 113 | 90.2 | 44 | 36.1 | 69 |
| Live streams | 14 | 12.2 | 0 | 0 | 14 |
| **Total** | **951** | **312.5** | **278** | **89.8** | **673** |

## The channel

| Type | Uploads | Hours |
|---|---:|---:|
| Videos | 844 | 211.9 |
| Podcast episodes (the podcast playlist) | 116 | 91.7 |
| Live streams | 14 | 12.2 |
| Shorts | 20 | 0.3 |
| **Total** | **994** | **316.0** |

43 uploads are out of scope:

- 20 shorts and 17 clips under 90 seconds.
- 1 unavailable (private or removed) podcast entry.
- 5 unlisted copies that a public upload replaces. They're missing from the channel tabs and reachable
  only through a playlist:
  - 3 are titled by the owner as old or not for publication ("ישן - לא לפרסום", "ישן- ניתן למחוק",
    a trailing "ישן"). They are earlier cuts of Ep. 109, Ep. 106 and China import Ep. 6.
  - 2 carry exactly the title of a public upload.
  - Before they were dropped, they took answer slots next to their public twins.
- The 113 in-scope podcast episodes are the 116 in the playlist minus 2 copies and the unavailable
  entry.

## Captions (in-scope videos)

| Status | Videos | Hours |
|---|---:|---:|
| Indexed in 2026-03 (auto captions) | 178 | 61.2 |
| Hebrew auto captions (new) | 70 | 20.1 |
| Manual Hebrew subtitles (new) | 30 | 8.5 |
| No Hebrew captions on YouTube | 673 | 222.7 |

- 788 videos were fetched without cookies, one polite sequential pass at a time.
- One 429 on the subtitle endpoint (2026-10-14) led to the two-step fetch described below. There
  were no blocks after that.

By upload year:

| Year | Videos | With transcripts | No captions |
|---|---:|---:|---:|
| 2014–2018 | 35 | 16 | 19 |
| 2019 | 37 | 6 | 31 |
| 2020 | 209 | 2 | 207 |
| 2021 | 178 | 5 | 173 |
| 2022 | 185 | 30 | 155 |
| 2023 | 120 | 32 | 88 |
| 2024 | 97 | 97 | 0 |
| 2025 | 28 | 28 | 0 |
| 2026 | 62 | 62 | 0 |

## Why 673 videos have no captions

YouTube creates Hebrew auto captions only for videos whose language is set. The fetched metadata
shows the pattern in every in-scope video:

| Caption status | Video language on YouTube | Videos |
|---|---|---:|
| Hebrew auto captions | Hebrew | 70 |
| Manual Hebrew subtitles | not set / Hebrew | 25 / 5 |
| **No captions** | **not set** | **666** |
| No captions | wrong language (en 2, ar 2, fr 1, nl 1) | 6 |
| No captions | Hebrew | 1 |

- All 41 fetched uploads from 2024 on are set to Hebrew, and all have captions. The 2026-03 metadata
  of the 178 videos indexed earlier doesn't record the language.
- The 34 older uploads that do have auto captions are all set to Hebrew.
- A probe of a sample with a second player client (`web`) found no caption tracks at all.

**Owner action.**

1. In YouTube Studio, open Content, select the old uploads, then Edit → Language → Hebrew (bulk edit).
   Also fix the 6 videos set to a wrong language.
2. A day or two later, run `fetch_captions.py --recheck-none`, or let Content Autopilot pick the
   videos up.
3. Then run the segment and index steps. Embedding all 673 would cost about **$0.17**.

Confidence:

- **High** that the missing language setting is why these videos have no auto captions (666 of 673,
  against 70 of 70).
- **Medium** that YouTube generates captions for old uploads after the setting changes. It's
  documented for new uploads but unverified here. Try 5–10 videos first.

The paid alternative was out of scope (no Whisper): about $80.17 with whisper-1 or $40.09 with
gpt-4o-mini-transcribe for the 222.7 hours, plus $0.17 of embeddings.

## Catalog

All 951 records have `kind` (video, podcast or live).

**Summaries:**

| Source | Videos |
|---|---:|
| New AI summaries, with key points and their seconds, costs, tips and warnings | 153 |
| Kept from the 2026-03 pipeline | 125 |
| Cleaned description of at least 40 characters | 23 |
| None (title-level pages show title, date, duration, category, player and related videos) | 650 |

- The new AI summaries cover the newest, most-viewed and legacy-linked videos.
- 30 videos have chapters, from their description timestamps.

**Categories** (all records): structure 320, finishes 224, electrical and plumbing 121, planning and
permits 121, contractors 81, costs 76, landscaping 6, general 2. The 751 added records were placed by
three rules:

- Playlist: 355.
- Title keywords: 230.
- Nearest category centroid: 166. About 1 in 5 records, so treat these as guesses.

## Retrieval quality

**Setup.**

- 30 realistic Hebrew questions across 9 topics, in `scripts/knowledge/quality/questions.json`.
- The production ranking: `semantic.ts` is imported as is, with runtime fusion off so only the
  static index is measured.
- Two views:
  - **Answer:** the 5 documents `/api/answer/stream` sends Claude (at most 3 articles; title-level
    rows are never sent).
  - **Videos:** the top 5 videos of `/api/search`.
- Each (question, document) pair is scored 0 (off topic), 1 (on topic, partly useful) or 2 (answers
  it). Judging was blind to the run: 383 pairs, in `scripts/knowledge/quality/judgments.json`.
- The judged excerpt is the opening of the matched segment. The route sends Claude the part of the
  segment that matches the question, so these scores are conservative.

**Answer view** (what Claude reads):

| | Before | Ranking fixes only | Interim (216 videos) | **Final** |
|---|---:|---:|---:|---:|
| Mean top-5 score (max 10) | 4.80 | 4.93 | 5.27 | **5.37** |
| Precision@5 (score ≥ 1) | 0.627 | 0.640 | 0.687 | **0.687** |
| Strongly relevant@5 (score 2) | 0.333 | 0.347 | 0.367 | **0.387** |
| Mean score of video documents | 0.55 | 0.53 | 0.78 | **0.79** |
| Questions citing a relevant new video | – | – | 10 | **13** |

- Per question: 11 improved, 16 unchanged, 3 worse (by 1 point each: q06 תב"ע, q10 when to order
  aluminium, q18 electrical points).
- By topic: costs 3.5 → 6.0, finishes 1.67 → 3.0, skeleton 7.0 → 7.5, waterproofing 5.67 → 6.0,
  contractors 4.75 → 5.0, permits 3.0 → 2.67. The rest are unchanged.

**Videos view** (what `/api/search` lists):

| | Before | Interim | **Final** |
|---|---:|---:|---:|
| Mean top-5 score (max 10) | 2.23 | 3.33 | **3.97** |
| Precision@5 | 0.340 | 0.493 | **0.553** |
| Strongly relevant@5 | 0.107 | 0.173 | **0.240** |
| Questions with a relevant new video in the top 5 | – | 15 | **22** |

Per question: 22 improved, 5 unchanged, 3 worse (q25 building supervisor 5 → 2, q06 1 → 0, q30
kitchen 2 → 1).

**Article cap.** Lowering the answer route's article cap (`MAX_POST_DOCS`) from 3 to 2 lowers the
answer score from 5.37 to 4.90 (precision 0.687 → 0.647). Articles are usually more on point than a
third video, so keep 3.

**What the regressions show** (recommendations for the `semantic.ts` owners; not changed here):

- **Spelling variants miss in the keyword channel.** It matches substrings, so "בנייה" (query) misses
  "בניה" (most titles), and "מפקח" misses "פיקוח". In q25 the two supervision episodes (Ep. 91,
  Ep. 94) lost their slots to Ep. 113 (insurance) and general videos. Normalising double yod and vav
  on both sides, plus a few lemma pairs, would recover them.
- **Acronyms with quotes split into fragments.** "תב"ע" becomes "תב" + "ע". ASCII quotes always did
  this; gershayim now behave the same since the "מ״ר" fix. Dropping quotes inside Hebrew words on both
  sides (תב"ע → תבע, ממ"ד → ממד) would keep acronyms whole.

## The demo question

"כמה עולה שלד לבית של 200 מ״ר ב-2026?"

**Before:** Ep. 109 was not in the top 80 rows. "מ״ר" survived as a rare, heavy keyword, and keyword
ties fell to alphabetical row order.

**Now** (static index, the merged answer route), the sources are:

1. Three 2026 cost articles.
2. Ep. 85 (`nAWQpkVgUQs`): segment 26:46–29:48, plays from **29:21**.
3. Ep. 109 (`vluNH7GTkU4`): segment 26:48–29:48, plays from **28:34**.
   - At 28:37 the owner says "השלדים … בממוצע 800,000 שק".
   - That passage is in Claude's context.

**Ep. 107** (`X78Yo_sJgIM`) is the third video and the 26th document overall.

- Its best segment is 44:41–47:43, playing from **46:08**:
  - "כמה שלד עלה לך … 575,000".
  - Then at 46:35, "באזור ה-850 800 שלדים היום".
  - At 47:26, "800,000 … מספר העוגן".
- It would be cited only with an article cap of 2.

**Real answer** (one call, Sonnet 4.6, local):

> "על פי הנתונים העדכניים מ-2026, שלד לבית של 200 מ"ר עומד על כ-800,000 ₪ לפני מע"מ – זהו הממוצע
> הנפוץ, אם כי הטווח הוא 600,000–850,000 ₪ בהתאם למורכבות הבית…"

- Its sources were the three articles, Ep. 85 @ 29:21 and Ep. 109 @ 28:34.
- `/search` lists Ep. 85, Ep. 109 and Ep. 107 as the first three videos.

## Size and cold load

| | Before | After |
|---|---:|---:|
| `search-index.json` | 4.5 MB | 7.2 MB |
| `search-index.f32` (1536-d float32) | 7.4 MB | 15.0 MB |
| `posts-index.{json,f32}` | 13.6 + 32.2 MB | unchanged |
| **All f32** | **39.5 MB** | **47.2 MB** |
| `videos.json` | 0.6 MB | 1.5 MB |
| Cold load: read, parse, norms, keyword text (median of 5 fresh processes) | 213 ms | **238 ms** |
| First search, cold load included | 278 ms | 315 ms |
| Warm search | 66 ms | 77 ms |
| Process RSS | 328 MB | 354 MB |

Neither threshold was reached (f32 over ~100 MB, or cold load over ~1.5 s). There is no int8
quantisation and no loader change; `semantic.ts` loads the index as before.

## API spend (knowledge squad)

| Run | Volume | USD |
|---|---|---:|
| Query embeddings for the eval and demo questions (cached) | 31 queries | ~0.0000 |
| Segment embeddings, first batch | 268 segments, 518,709 tokens | 0.0104 |
| Title-context re-embedding of all segments | 1,468 segments, 2,937,014 tokens | 0.0587 |
| Segment embeddings, second batch | 20 segments, 38,357 tokens | 0.0008 |
| Final embeddings: 329 segments + title-level rows | 1,002 rows, 667,861 tokens | 0.0134 |
| AI summaries, Haiku 5.5 Batches API | 97 videos, 1,242,801 in / 115,763 out | 0.0911 |
| AI summaries top-up, Haiku 5.5 Batches API | 60 videos, 511,704 in / 59,855 out | 0.0405 |
| Real answers for the demo screenshots (Sonnet 4.6 + Haiku 4.5 classifier) | 2 answers, 20,746 in / 513 out | 0.0639 |
| **Total** | | **0.279 of 1.50** |

## How it was built

### 1. Inventory

- Flat listings of `/videos`, `/streams`, `/shorts`, `/podcasts` and all 40 playlists, fetched with
  `youtube:lang=iw` so titles come back in Hebrew rather than auto-translated.
- yt-dlp 2026.03.13 stopped paging playlists at 100 entries. Both the podcast playlist (116) and
  "מדריך הבניה" (224) were refetched with 2026.08.19, which pages correctly. `scripts/.venv` still has
  2026.03.13; anything that lists playlists needs the newer yt-dlp.
- Types: podcast (in the podcast playlist) > live (`/streams`) > short (`/shorts`) > video.
- Each record carries `excluded`, the reason it stays out of the index and catalog, and
  `index_scope`:
  - shorts and clips under 90 seconds;
  - unavailable videos;
  - unlisted copies that a public upload replaces (`superseded_copies`): no channel tab, and either
    the owner's "old / not for publication / can be deleted" marker or a public video's exact title.
- Flat listings carry no dates. Exact dates come from per-video metadata; the rest are interpolated
  from the newest-first tab order and flagged `upload_date_exact: false`.
- Output: `data/raw/channel_inventory.json` (one record per video, plus a summary block).

### 2. Captions

- Two requests per video, sequential, with no browser cookies and no media download:
  1. A metadata extraction (`download=False`).
  2. One json3 download of the Hebrew track.
- Equivalent to `--skip-download --write-subs --write-auto-subs --sub-langs iw,he --sub-format json3`.
  It needs yt-dlp 2026.08+ with node for YouTube's JS challenges.
- Manual Hebrew subtitles win over auto captions, with two exceptions:
  - A manual track under 300 characters (a title or "[מוזיקה]") falls back to the ASR track.
  - An auto track counts only when its speech recognition itself is Hebrew (`iw-orig`). A plain
    `iw` auto track can be a machine translation of another language's ASR.
- Pacing:
  - 1 s between requests and a random 9–13 s between videos, about 250 videos an hour (YouTube's
    guest limit is about 300).
  - On 429 or "confirm you're not a bot": back off exponentially (1, 2, 4 … 30 min), retry the same
    video, and stop after 6 blocks in a row.
  - A rate-limited subtitle download (`blocked_subs`) keeps the metadata. It is retried after a
    cool-down at the end of the run.
  - The run is resumable from `data/raw/captions_status.json`.
- Queue order (the product priority):
  1. Podcasts and cost or budget episodes from 2023 on.
  2. Other 2025–2026 videos.
  3. Older series (old podcasts and cost episodes first, then videos on legacy `/video/` pages).

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
- **Title-level rows:** a video without captions gets one row.
  - It holds the title plus the chapter titles, with `title_only: true` and the whole video as its
    span.
  - It's ranked like any other row. `/api/search` shows it without a timestamp (its summary, if
    any, is the snippet).
  - The answer route never sends it to Claude as a source.
- **Marks:** rows carry `marks`, a list of `[char offset, second]` pairs about every 10 s,
  rebuilt from the caption lines. 100% of segments reconstruct exactly.
- **Embedding cache:** `data/processed/segment_embeddings.{keys.json,f32}`, keyed by text hash and
  seeded from the committed index. A rebuild only pays for new text.
- **Cost controls:**
  - `--dry-run` estimates the cost with tiktoken (`cl100k_base`, the text-embedding-3-small
    tokenizer). The billed tokens matched the estimate exactly.
  - `--max-cost` refuses to run over budget.

### 4. Catalog (`apps/web/data/videos.json`)

- **Rebuilt from the base revision** (`--base 095a3d5`, the program start), so every added record
  is re-decided on each run. The 200 base records are kept, with `has_transcript`, chapters and
  `kind` filled in.
- **New records:** Hebrew title, duration, date, views and a `maxresdefault`/`hqdefault` thumbnail
  on `i.ytimg.com/vi/`. Also `kind` (video, podcast or live) and `chapters`.
  - Chapters come from yt-dlp, which parses them from the description; a parser for
    "0:00 title" lines is the fallback.
- **Descriptions:**
  - Most descriptions are only the channel's 18-line CTA template.
  - The cleaned description drops these lines:
    - lines shared by 10 or more descriptions;
    - timestamps, links and hashtags;
    - phone numbers, greetings and calls to action.
  - The cleaned description becomes the summary only when 40 or more characters remain.
- **Category:** three free rules, in order:
  1. The owner's topical playlist (28 playlists mapped to the 8 existing categories).
  2. Title keywords. Cost words yield to any other topic.
  3. The nearest category centroid of segment embeddings, among the tied title categories (or
     all of them). Centroids are built from rule-labelled videos.
- **AI summaries** for the most important new videos (newest, most viewed, legacy-linked):
  - Model and pricing: Claude Haiku 5.5 (`claude-haiku-5-5`) through the Message Batches API at
    50%: $0.05 / $0.25 per MTok.
  - Each video gets a summary, 4–6 key points with the second each is discussed, and the prices,
    tips and warnings stated in the video.
  - Output is schema-constrained JSON, and the 2026-03 summaries were left untouched.
- **Legacy pages:** they link to `/video/<id>/` (the "סיכום הסרטון, עם חותמות זמן" card) whenever
  one of their `video_pages.youtube_ids` is in the catalog with a transcript. That link is the "legacy page with
  AI coverage" counted above. The DB was only read.

### 5. Answer route and ranking (minimal edits)

- **`semantic.ts`** (two one-line fixes):
  - Geresh and gershayim (׳ ״) are treated like ASCII quotes in query terms. Before, "מ״ר"
    survived as a rare keyword with a huge IDF and pulled every article that spells it that way to
    the top.
  - Keyword-score ties are broken by cosine rather than by row order. Rows are alphabetical by
    YouTube id, so ties used to favour arbitrary videos such as `-Kg-k0VlTU0`.
- **`/api/answer/stream`**:
  - The route has a single hook, `focusForQuery(query)`, and the logic is in
    `lib/knowledge/moments.ts`.
  - Each video segment sends Claude the 800-character window that matches the question. Before,
    only the first 800 characters were sent. For cost questions the window is price-aware.
  - The source plays from the second that passage is said, taken from `marks`, rather than from
    the 3-minute segment start.
  - Title-level rows are filtered out of the documents (`isTitleOnly`).
- **`/api/search`:** snippets drop the title line, and title-level hits have no matching second.
- **`/video/<id>/`:** a "פרקים בסרטון" chapters card, and key points with their seconds.
- **Sitemap:** it lists every catalog video. `getVideos` caps a page at 100, so the sitemap had only
  the newest 100.

## Run book

```bash
Y=/path/to/venv-with-yt-dlp-2026.08+   # pip install -U "yt-dlp[default]"; node or deno on PATH
P=scripts/.venv/bin/python

# 1. inventory (listings: see the docstring of scripts/knowledge/inventory.py)
$P -m scripts.knowledge.inventory
# 2. captions: polite, resumable, run in the background (--recheck-none after a language fix)
$Y/bin/python -m scripts.knowledge.fetch_captions >> data/raw/captions_fetch.log 2>&1
# 3. segments, then embeddings (estimate first)
$P -m scripts.knowledge.build_segments
$P scripts/build_search_index.py --dry-run
$P scripts/build_search_index.py --embed-only --max-cost 0.50
# 4. catalog (rebuilt from the base revision, so every added record is re-decided)
$P -m scripts.knowledge.build_catalog --base 095a3d5
$P -m scripts.knowledge.summarize --dry-run          # then without --dry-run (batch)
$P -m scripts.knowledge.build_catalog --base 095a3d5   # merges the AI summaries
# 5. index (title-level rows included; filtered to the catalog and the inventory scope)
$P scripts/build_search_index.py
# 6. numbers, quality, load time
$P -m scripts.knowledge.coverage --before 095a3d5
node scripts/knowledge/quality/retrieval_check.mjs --root apps/web --cache data/processed/quality/query_embeddings.json --out after.json
$P -m scripts.knowledge.quality.score sheet --skip=scripts/knowledge/quality/judgments.json before.json after.json
$P -m scripts.knowledge.quality.score score scripts/knowledge/quality/judgments.json before.json after.json
$P -m scripts.knowledge.quality.score compare scripts/knowledge/quality/judgments.json before.json after.json
node scripts/knowledge/quality/load_time.mjs --root apps/web --cache data/processed/quality/query_embeddings.json
# tests
$P -m unittest scripts.knowledge.test_catalog
```

- `before.json` comes from a snapshot directory holding `data/{search-index,posts-index}.{json,f32}`
  and `data/videos.json`, taken from `git show 095a3d5:apps/web/data/...`.
- `--view=videos` scores the `/api/search` view.
- `MAX_POST_DOCS=2 node …retrieval_check.mjs` measures the article-cap alternative.
