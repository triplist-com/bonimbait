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

**Running total:** ~$0.27 (autopilot ~$0.09 of $0.75; knowledge $0.161 of $1.50)
