# Content Autopilot (P5)

**Keep filming; the platform does the rest.** A new video on the channel is detected,
transcribed, chunked, embedded and summarised at runtime, then published by staff with one
click. It gets a `/video/<youtube-id>/` page, goes into the sitemap, and shows up in search and
in AI answers. There is no index rebuild and no redeploy.

Owner: `autopilot` squad. Code: `apps/web/lib/autopilot/`, `apps/web/app/admin/autopilot/`,
`apps/web/app/api/{cron,admin/autopilot}/`, `apps/web/components/{autopilot,admin/autopilot}/`.

## 1. How it works

```
YouTube RSS (+ optional podcast RSS)
        │  daily cron, or "בדיקת הערוץ עכשיו"
        ▼
detected ──► transcribing ──► transcribed ──► summarizing ──► indexed ──► published
                 │                 ▲                │                        │
                 ▼                 │                ▼                        ▼
          needs_transcript ── upload/paste       failed (retry)        indexed (unpublish)
       (no captions / blocked)   or audio
                                              skipped ◄── any waiting state (restore -> detected)
```

| Step | What happens | Where |
|---|---|---|
| Detect | Parse the channel's Atom feed (15 newest uploads, free, no key) and `PODCAST_RSS_URL`. Insert `detected` rows for items that are neither in the static index (`apps/web/data/videos.json`) nor already in the store. Idempotent. | `detect.ts`, `rss.ts` |
| Transcribe (a) | Fetch Hebrew captions server-side: InnerTube player API as the ANDROID (then IOS) client, then the track as **json3**. That is the format yt-dlp gave the static pipeline, so the cues are byte-identical to it. Manual Hebrew is preferred over auto-generated. | `captions.ts` |
| Transcribe (b) | Staff upload a VTT/SRT/SBV/TXT/json3 file or paste text in the detail view. | `transcript.ts`, `saveTranscript` action |
| Transcribe (c) | Optional (`AUTOPILOT_AUDIO_TRANSCRIPTION=true`): upload an audio file (≤25 MB) to the private `autopilot-audio` bucket; OpenAI `whisper-1` returns timed segments. | `audio.ts`, `/api/admin/autopilot/transcribe-audio` |
| Chunk | `chunkCues()` is a line-by-line port of `scripts/transcribe/segment.py`: 2-5 minute chunks, target 3, split at pauses or sentence ends, short tail merged. | `chunk.ts` |
| Embed | `text-embedding-3-small`, 8,000-character cap per chunk, as in `scripts/build_search_index.py`. Runtime and static cosines are on the same scale. | `embed.ts` |
| Summarise | Claude Haiku 5.5 (`claude-haiku-5-5`) with structured outputs (`messages.parse` + zod). Produces a Hebrew summary, key points with seconds, stated costs, tips, warnings, chapters, a video category, a build stage and 3 suggested questions. `normalizeSummary()` clamps times, sorts, and drops costs without a number. | `summarize.ts`, `summary.ts` |
| Publish | Staff review and edit the summary, then click "פרסום באתר". This revalidates `/video/*` and the sitemap. | `manage.ts`, `lib/admin/actions/autopilot.ts` |

Every status change is a **compare-and-set** on the status read just before it
(`store.transition`), so two clicks or a cron run can't run a step twice. A step cut off
mid-way (function timeout, crash) is shown as failed after 10 minutes and can be retried
(`status.ts`, `isStale`).

**Time budget.** The routes run for at most 60 s. A run has a 52 s deadline
(`FUNCTION_BUDGET_MS`), and every step sizes its timeout to what is left:

- Captions use 8 s per request.
- Embeddings use up to 25 s.
- Claude gets the rest, up to 45 s, with no retry that wouldn't fit.

Spend is therefore written before the platform can kill the function. If transcription leaves
less than 30 s, the run stops at `transcribed` and returns `next: 'index'`; the admin UI then
calls again by itself. The cron starts a source only when 40 s are left.

### Data model (migration `20261014103000_autopilot_knowledge_store.sql`)

- `knowledge_sources`: one row per video, episode or upload. Holds kind, external id, metadata,
  status and error, the transcript (text + timed cues), the summary (jsonb), the chunk count,
  `cost_usd_micros`, a per-call `usage` log, attempts, `is_demo`, and publish fields.
- `knowledge_chunks`: `source_id`, `chunk_index`, `start_s`, `end_s`, `text`,
  `embedding vector(1536)` (HNSW, cosine) and `tokens`.
- RLS: staff (`is_staff()`) have full access; members get no rows; **anon has no access at all**
  (table and RPC privileges are revoked). Search and public pages read server-side with the
  service role.
- `match_knowledge_chunks(query_embedding, match_count, min_similarity)`: cosine matches over
  chunks of **published** sources only, with the source fields the routes need. A plain HNSW
  scan applies the "published" filter after it takes ~ef_search candidates, so results could
  come back short. With pgvector ≥ 0.8 the function enables **iterative index scans
  (`strict_order`)** for its own transaction. Older versions take an exact scan over published
  chunks, which is fine at this store's size. Verified locally: identical to a brute-force
  top 5.
- Storage bucket `autopilot-audio` (private, staff only), used only by strategy (c).

### Search fusion (`app/api/_lib/semantic.ts`)

The hook is about 15 lines in `semanticSearch()`:

1. After the query is embedded, `searchRuntimeSegments()` (`fusion.ts`) calls the RPC. It runs
   while the static rows are scored.
2. Runtime rows join the **same** cosine and keyword rankings as virtual rows `N..N+R-1`, with the
   same IDF weights and the same Hebrew prefix rule. RRF then runs once over everything.
3. Hits have the static shape (`kind: 'video'`, `youtube_id`, `segment_index`, `start_time`,
   `end_time`, `text`, `score`, `cos`), so `/api/search`, `/api/answer/stream` and the UI are
   unchanged.
4. **Static wins:** runtime chunks whose YouTube id has segments in the static index are dropped.
5. **Fail-open:** no store configured, an error, or more than `AUTOPILOT_SEARCH_TIMEOUT_MS`
   (800 ms) all return `[]`. A circuit breaker then skips the store for 30 s, or for 5 min if the
   RPC is missing. Warnings are rate-limited.
6. The routes look titles up with the synchronous `getVideo()`. `data.ts` falls back to a
   per-instance registry of published runtime videos that search just returned
   (`registry.ts`, 10-minute TTL).

Measured locally: the RPC takes **9 ms median and 13 ms p90**. With a deliberately invalid service
key, search returned static-only results with HTTP 200, plus one warning.

### Video pages (`app/video/[id]/page.tsx`)

The resolver order is:

1. A legacy WordPress slug (`video_pages`).
2. The static index, which renders the existing client page.
3. A **published** knowledge source, which renders `RuntimeVideoPage` (server-rendered).

Any other YouTube id now returns a real 404. A store error throws, so ISR keeps serving the last
good page.

The runtime page reuses `VideoPlayer` and `ContentSummary`. It adds chapters with click-to-seek
(the player remounts at the chosen second), timestamped key points, and "שאלו על הסרטון": a plain
GET form into `/search/` plus the suggested questions. It also carries `VideoObject` +
`Clip` ("key moments") JSON-LD. Legacy pages that embed a published runtime video link to its AI
page (`findAiPageYoutubeId`).

## 2. Operations

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `CRON_SECRET` | none | **Required** for the cron. Vercel sends `Authorization: Bearer $CRON_SECRET`. Without it every cron call gets 401. |
| `YOUTUBE_CHANNEL_ID` | `UCCehs0A1gUmOUtZIhvkXVJQ` | Channel to watch. |
| `PODCAST_RSS_URL` | unset | Optional podcast feed to watch. |
| `AUTOPILOT_AUTO_PROCESS` | `false` | Cron also processes, in this order: new YouTube videos, then `transcribed` sources (budget-refused or handed off), then YouTube videos whose captions weren't ready (up to 3 attempts). Podcast episodes wait for staff. It never publishes. |
| `AUTOPILOT_AUTO_PROCESS_LIMIT` | `1` | Videos per cron run (1-5). |
| `AUTOPILOT_MAX_USD_PER_VIDEO` | `0.10` | Budget gate: upper-bound estimate per processing run. |
| `AUTOPILOT_MONTHLY_BUDGET_USD` | `2` | Budget gate: rolling 30-day spend, summed exactly from every source's timestamped usage log (embeddings, summaries and audio). |
| `AUTOPILOT_AUDIO_TRANSCRIPTION` | `false` | Enables transcript strategy (c). |
| `AUTOPILOT_SEARCH` | on | Set to `off` to stop fusion (kill switch). |
| `AUTOPILOT_SEARCH_TIMEOUT_MS` | `800` | Hard cap on the store query inside search. |

Also used: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY`.

### Schedule and endpoints

- `vercel.json` cron: `GET /api/cron/youtube-watch` daily at 06:00 UTC (09:00 Israel). The channel
  publishes around 21:30 Israel, so new videos are in the queue the next morning. Daily is the
  Vercel Hobby limit. On Pro, `0 */6 * * *` works.
- Admin endpoints (editor or admin; 401 when signed out, 403 for members and pros):
  `POST /api/admin/autopilot/check` (detection only), `POST /api/admin/autopilot/process`
  `{id}` (up to ~20 s per video), and `POST /api/admin/autopilot/transcribe-audio` `{id, path}`.
- Every route has `maxDuration` ≤ 60 s. Processing one 15-minute video took about 15 s locally.

### Deploy checklist (orchestrator)

1. Apply `supabase/migrations/20261014103000_autopilot_knowledge_store.sql` to the hosted project.
   It enables `vector` in `extensions`. The migration is idempotent.
2. Set `CRON_SECRET` in Vercel (and the optional variables above).
3. Deploy. Open `/admin/autopilot/` and click "בדיקת הערוץ עכשיו".

### Parity fixture

`apps/web/tests/autopilot/fixtures/chunking-parity.json` holds cue lists and the segments
`segment.py` produced for them. To check every stored transcript against its stored segments,
and every stored json3 file against its stored cues, run:

```bash
cd apps/web && AUTOPILOT_PARITY_DATA_DIR=/path/to/checkout/data/processed npx vitest run tests/autopilot/chunk.test.ts
```

Status on 2026-10-14: all 222 stored transcripts and json3 files match exactly. That includes the
files the `knowledge` squad added that day.

## 3. Cost per video

These are measured runs (2026-10-14, local). The prices are Haiku 5.5 at $0.10 / $0.50 per MTok
for prompts up to 100K tokens, and `text-embedding-3-small` at $0.02 per MTok.

| Video | Length | Transcript | Chunks | Claude in / out (thinking) | Embedding tokens | Cost |
|---|---:|---|---:|---|---:|---:|
| `EeMos4VM2oU` stone cladding | 5:08 | YouTube auto-captions | 2 | 4,427 / 2,467 (647) | 3,561 | **$0.0017** |
| `gxw0nQrcGMs` finishes tour | 15:48 | YouTube auto-captions | 5 | 10,031 / 1,665 (0) | 11,161 | **$0.0021** |
| `in29RM-idBY` coloured plaster | 14:14 | uploaded VTT | 5 | 9,559 / 2,162 (0) | 10,476 | **$0.0022** |

- **About $0.002 per video** (median of the three runs), or about 1 agora. A 60-minute podcast
  episode is estimated at under $0.01.
- Hebrew is token-dense: about 1.05 characters per token for the embedding model and about 1.3
  for Haiku 5.5. Pre-call estimates use 1 token per character, plus the full 16K output budget,
  so the budget gate's estimate is an upper bound (about $0.01 per video).
- Optional audio transcription costs $0.006 per audio minute (about $0.09 for a 15-minute video).
- Model choice: Haiku 5.5 is the cheapest current model. With structured outputs it produced
  correct, natural Hebrew summaries and real prices in every run, at effort `medium`. Thinking
  stayed between 0 and 650 tokens. Prompt caching isn't used: each prompt is processed once, and
  the stable prefix is barely over the 512-token cache minimum.
- Spend is stored per source (`cost_usd_micros` and the `usage` log, shown in the detail view)
  and logged as `[autopilot] spend …`. When the foundation squad's `lib/guard/aiBudget.ts`
  lands, swap `getBudgetGuard()` in `lib/autopilot/cost.ts`. The pipeline depends only on the
  `AutopilotBudgetGuard` interface.

## 4. Failure modes and fixes

| Symptom (admin) | Cause | Fix |
|---|---|---|
| "חסר תמליל", with "יוטיוב חסם…" and `[blocked]` or `[empty]` | YouTube refuses datacenter IPs ("confirm you're not a bot") or requires a proof-of-origin token. This is likely on Vercel. | In YouTube Studio go to Subtitles, then ⋮, then Download (.vtt or .srt), and upload the file in the detail view with "להמשיך מיד לעיבוד". Or set `AUTOPILOT_AUDIO_TRANSCRIPTION=true` and upload the audio. Running "עיבוד" from a residential IP (local) also works. |
| "חסר תמליל", with "עדיין אין כתוביות" and `[no_captions]` | Auto-captions aren't ready yet (usually hours after upload; the newest test video had them after 28 minutes). | With auto-processing on, the cron retries by itself (up to 3 runs). Otherwise click "ניסיון חוזר" later, or upload a transcript. |
| `[unplayable]` | The video is private, unlisted or deleted. | Skip it. |
| "נכשל" with a summary error | Claude refused, or the output was incomplete. Spend is still recorded. | Click "ניסיון חוזר". The transcript is kept, so captions aren't fetched again. |
| "נכשל" with "עיבוד קודם נקטע באמצע" | The step ran past the function limit or the server crashed. That should be rare with the time budget. | Click "ניסיון חוזר" (offered automatically after 10 minutes). |
| Error "תקציב העיבוד החודשי נוצל" or "גבוהה מהתקרה לסרטון" | The budget gate refused before any paid call. | Raise `AUTOPILOT_MONTHLY_BUDGET_USD` or `AUTOPILOT_MAX_USD_PER_VIDEO`, or wait for the window to roll. |
| Search fine, but new videos missing from it | The store is unreachable, the RPC is missing, or `AUTOPILOT_SEARCH=off`. | Look for `[autopilot] runtime search skipped (fail-open)` in the logs. Apply the migration and check the service key. Static search keeps working meanwhile. |
| The cron returns 401 | `CRON_SECRET` isn't set in Vercel, or doesn't match. | Set it. Vercel sends it automatically. |
| A podcast episode won't publish | Only YouTube sources get a page today. | It stays indexed. Podcasts that are also on YouTube, which the owner's are, come in through the YouTube feed. |

## 5. Day to day (for the owner)

1. Film and upload to YouTube as usual.
2. The next morning the video is in **ניהול האתר → אוטופיילוט תוכן**. With auto-processing on,
   it is already summarised ("מוכן לפרסום"). Otherwise click **עיבוד** (about 15 seconds).
3. Open the video and read the summary, chapters, prices and suggested questions. Fix anything
   in the editor (one line per item; chapters as `1:30 | כותרת`).
4. Click **פרסום באתר**. The page is live at `/video/<id>/`, it's in the sitemap, and the video
   is in search and in the AI advisor's answers with jump-to-moment links.
5. Something wrong later? Click **הסרה מהאתר**: the page goes away and search drops the video at
   once.

## 6. Verification (2026-10-14, local)

- Detection: "בדיקת הערוץ עכשיו" inserted all 15 feed videos (none was in the static index). A
  cron call with the secret then inserted 0 (idempotent). Without the secret, or with a wrong
  one, it returned 401.
- Processing: two videos through YouTube captions and one through an uploaded VTT. All three
  reached `indexed`, then `published`.
- Search: "כמה עולה חיפוי אבן פראית למטר" ranks the new video **first**, above the static
  stone-cladding video. The AI answer cites it as its **first source** at 0:03.
- Unpublish: the video left search immediately and its page returned 404. Republishing
  restored both.
- Roles, live: a member got 403 from the admin endpoints and was redirected from
  `/admin/autopilot/`. An editor got 200.

## 7. Known limits and next steps

- Only YouTube sources get pages and search fusion. Podcast-only and uploaded sources are
  stored, indexed and publishable, but need a page type before they are fused into search.
- The RSS feed carries the 15 newest uploads. Backfilling older videos is the `knowledge`
  squad's static-index work; runtime ids that later enter the static index are dropped from
  fusion automatically.
- Search category counts (`/api/categories`) and the `/videos/` list only show the static
  index.
- The admin shell (fixed 240 px sidebar) doesn't collapse on mobile, so all admin pages,
  this one included, are cramped at 390 px. The foundation squad owns admin navigation.
