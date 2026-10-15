# AI search coverage of legacy content (Wave 2 analysis)

> **Update 2026-10-15 (platform `knowledge` squad).** The whole channel has been inventoried and
> every video with Hebrew captions is now indexed. Current numbers, method and quality check:
> [`docs/platform/KNOWLEDGE_COVERAGE.md`](platform/KNOWLEDGE_COVERAGE.md).
>
> **Current numbers:**
> - The channel has 994 uploads (316.0 h). 951 long-form videos (312.5 h) are in scope.
> - The AI index holds the transcripts of **278 of 951 videos (89.8 h, 29%)**, as 1,774 segments.
>   That's up from 178 videos (61.2 h).
> - The other 673 videos (222.7 h) have title-level entries: findable in search and as related
>   videos, with no moments.
> - 80 of the 188 legacy `/video/<slug>/` pages have AI coverage, up from 37.
>
> **What changed against this analysis:**
> - The "none" caption status is **not** an artefact of the 2026-03 rate limits.
>   - The re-probe ran sequentially at about 250 videos an hour with yt-dlp 2026.08.19 and
>     had no blocks.
>   - A second player client (`web`) on a sample found no caption tracks for these videos. It does
>     see the (PO-token-gated) tracks of captioned ones.
>   - 666 of the 673 uncaptioned videos have **no video language set** on YouTube. 6 have a wrong
>     one and 1 is set to Hebrew. All 70 newly auto-captioned videos are set to Hebrew.
>   - So the cheapest fix is probably free: set "Video language: Hebrew" in YouTube Studio (a
>     bulk edit), then re-run `scripts/knowledge/fetch_captions.py --recheck-none`.
>     - Confidence is high on the cause. It's medium that YouTube backfills captions for old
>       uploads, so try a few videos first.
>     - Embedding all 673 would cost about $0.17. Whisper would cost $40–80.
> - Posts are indexed (5,233 chunks, see section 2), as recommended below.
>
> The rest of this page is the original analysis.

This is an analysis only. No paid API calls or embeddings were run; the orchestrator decides in Wave 3.
- Reproduce with `scripts/.venv/bin/python scripts/migrate/search_coverage.py`.
- The per-video detail is in `data/migration/search_coverage.json`.
- Prices assumed:
  - text-embedding-3-small: $0.02 per 1M tokens
  - whisper-1: $0.006 per minute
  - gpt-4o-mini-transcribe: $0.003 per minute
- Project cap: **$20 total**.

## 1. Legacy video pages missing from the search index

**151** of the 188 live `/video/<slug>/` pages have no YouTube id in `apps/web/data/search-index.json`. They cover **149 unique videos**; two pages share videos.

| Subtitle status (Hebrew) | Videos | Minutes | Source |
|---|---:|---:|---|
| Manual subtitles (`manual_he`) | 8 | 283 | yt-dlp metadata |
| Auto captions (`auto_he`) | 35 | 614 | yt-dlp metadata |
| No Hebrew captions reported (`none`) | 103 | 1,287 | 100 from yt-dlp, 3 from `data/raw/subtitles/subtitle_status.json` |
| Private / unavailable | 3 | – | `zPFD_Tjuskc`, `NtwaPU_JZpg`, `M-QhEXaQPW4` |

- The 3 private videos can't be indexed at all. Their pages should keep rendering from the crawled data.
- **Treat "none" as an upper bound.** The probe used `extract_info(download=False)`, which fetches metadata only, no media. It ran at concurrency 3 and was accurate on control videos that are known to have auto captions. Partway through, however, YouTube started answering with 429s and "confirm you're not a bot". Degraded responses can omit captions, so some of the 103 may actually have auto captions.
- Re-probe before paying for Whisper. Run the script again later, or add `cookiesfrombrowser` to its yt-dlp options.
- Most of the "none" videos are older (2019–2022) series episodes.

### Cost to bring them into AI search

| Step | Volume | Cost |
|---|---|---:|
| Subtitles download (43 with captions) | – | $0 |
| Whisper for "none" (upper bound) | 1,287 min | **$7.72** (whisper-1) / **$3.86** (gpt-4o-mini-transcribe) |
| Embeddings for all 146 transcripts | ~1.38M tokens (632 tokens per spoken minute, measured on our existing transcripts) | **$0.03** |

Recommendation: index the 43 captioned videos first; that costs only about $0.01 in embeddings. Then re-probe the "none" set and budget Whisper for whatever still has no captions.

Local Whisper (large-v3 on this Mac) costs $0, but takes hours for about 21 hours of audio.

## 2. Indexing the 804 posts

This was counted with `tiktoken` (`cl100k_base`, the text-embedding-3-small tokenizer) on the **sanitized** post text, meaning the title plus body with scripts, forms and markup removed.

| Metric | Value |
|---|---:|
| Posts | 804 |
| Total tokens | **5,754,759** |
| Characters | 6,037,380 |
| Average tokens per post | 7,158 |
| Largest post | 58,156 tokens |
| Posts over the 8,191-token input limit | 295 (these must be chunked) |
| **Embedding cost** | **$0.115** |
| With ~20% chunk overlap | $0.138 |

Note: Hebrew runs at about 0.95 tokens per character with this tokenizer. The usual "chars / 4" estimate (1.5M tokens) would **undercount by nearly 4×**. The cost is still trivial either way.

## Budget summary

| Option | Cost |
|---|---:|
| Posts only (chunked, 20% overlap) | ~$0.14 |
| Posts + 43 captioned legacy videos | ~$0.15 |
| + Whisper for all "none" videos (upper bound, whisper-1) | ~$7.90 |
| + same with gpt-4o-mini-transcribe | ~$4.05 |

All of these fit under the $20 cap, but the Whisper line dominates. A query-time cost also applies: embedding each search query is negligible. The Claude answer generation is a separate cost, not counted here.
