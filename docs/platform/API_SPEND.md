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
| 2026-10-15 | command | Content-gap calibration: embeddings of 84 labelled test questions and their topic texts (3 rounds), text-embedding-3-small | 7,667 tokens | 0.0002 |
| 2026-10-15 | command | Content-gap engine e2e on local seed data (77 questions, 29 topics), 3 refreshes: question embeddings (text-embedding-3-small) | 11,358 tokens | 0.0002 |
| 2026-10-15 | command | Same 3 refreshes: cluster labels + coverage review, Claude Haiku 5.5 (thinking on, off, on; recorded in `ai_usage` as `insights_labels`) | 26,916 in / 15,099 out tokens | 0.0103 |

**Running total:** ~$0.40 (autopilot ~$0.09 of $0.75; knowledge $0.279 of $1.50; command $0.011 of $0.50)
