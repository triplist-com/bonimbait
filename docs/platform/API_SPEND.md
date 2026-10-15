# API spend ledger: platform program

Program cap: **$5.00** of new spend. The project's lifetime cap is $20.
Log every paid run here: amounts and volumes only, never keys.

| Date | Squad | What | Volume | Cost (USD) |
|---|---|---|---|---:|
| 2026-10-14 | orchestrator | One production AI answer while auditing `/search` | 1 question | ~0.02 |
| 2026-10-14 | autopilot | Content Autopilot e2e: video summaries, Claude Haiku 5.5 (local, 3 new videos totalling 35 min, plus 1 short pasted transcript) | 25,807 in / 6,911 out tokens | 0.0060 |
| 2026-10-14 | autopilot | Content Autopilot e2e: chunk embeddings, text-embedding-3-small (13 chunks) | 25,320 tokens | 0.0005 |
| 2026-10-14 | autopilot | Query embeddings for about 25 local test searches | ~600 tokens | <0.0001 |
| 2026-10-14 | autopilot | Citation proof: 3 AI answers through the existing `/api/answer/stream` (Sonnet 4.6 + Haiku 4.5 pros classifier). The route doesn't log usage, so this is estimated | ~3 × (8K in / 300 out) | ~0.08 |
| 2026-10-14 | knowledge | Query embeddings (text-embedding-3-small) for the 30-question retrieval check and the demo question, cached | 31 queries, ~700 tokens | ~0.0000 |
| 2026-10-14 | knowledge | Segment embeddings, first new batch (38 videos incl. podcast Ep. 109) | 268 segments, 518,709 tokens | 0.0104 |
| 2026-10-14 | knowledge | Title-context embeddings of every video segment (178 indexed + 38 new) | 1,468 segments, 2,937,014 tokens | 0.0587 |
| 2026-10-14 | knowledge | Segment embeddings, second batch (6 videos) | 20 segments, 38,357 tokens | 0.0008 |
| 2026-10-14 | knowledge | AI summaries + key moments, Claude Haiku 5.5 via the Batches API (50%) | 97 videos, 1,242,801 in / 115,763 out tokens | 0.0911 |
| 2026-10-15 | knowledge | Final embeddings: 329 segments of the last captioned videos + title-level rows of the uncaptioned videos | 1,002 rows, 667,861 tokens | 0.0134 |
| 2026-10-15 | knowledge | AI summaries top-up (newest, most viewed, legacy-linked), Claude Haiku 5.5 via the Batches API (50%) | 60 videos, 511,704 in / 59,855 out tokens | 0.0405 |
| 2026-10-15 | knowledge | 2 real AI answers for the demo screenshots (desktop, mobile; production build), Sonnet 4.6 + Haiku 4.5 pros classifier, read from the local `ai_usage` table | 20,746 in / 513 out tokens | 0.0639 |
| 2026-10-15 | advisor | Development answers through the new pipeline (Claude Sonnet 5.5), including the thinking-setting comparison, plus the Haiku 4.5 pros classifier. All advisor rows are read from the local `ai_usage` table | 5 answers (23,391 in / 4,209 out; cache 6,134 written, 1,591 read) + 6 pros calls | 0.1136 |
| 2026-10-15 | advisor | Demo fixture: 3 recordings of the demo question (the first is kept), Sonnet 5.5 + pros classifier | 3 answers (13,924 in / 2,081 out; cache 1,591 written, 3,338 read) + 3 pros calls | 0.0578 |
| 2026-10-15 | advisor | Evaluation: 15 questions, plus 8 re-runs after prompt tuning (`docs/platform/ADVISOR_EVAL.md`), Sonnet 5.5 + pros classifier | 23 answers (104,406 in / 14,847 out; cache 4,929 written, 32,288 read) + 23 pros calls | 0.4101 |
| 2026-10-15 | advisor | `/ask/` screenshots on the production build (desktop, mobile), Sonnet 5.5 + pros classifier | 4 answers (18,816 in / 2,615 out) + 4 pros calls | 0.0749 |
| 2026-10-15 | advisor | Follow-up rewrite (Claude Haiku 5.5) | 1 call, 667 in / 53 out tokens | 0.0001 |
| 2026-10-15 | advisor | Query embeddings (text-embedding-3-small) for advisor questions and free dry runs | ~100 queries, ~2K tokens | <0.0001 |

**Running total:** ~$1.04 (autopilot ~$0.09 of $0.75; knowledge $0.279 of $1.50; advisor $0.657 of $1.00)
