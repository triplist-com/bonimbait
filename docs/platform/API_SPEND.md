# API spend ledger: platform program

Program cap: **$5.00** of new spend. The project's lifetime cap is $20.
Log every paid run here: amounts and volumes only, never keys.

| Date | Squad | What | Volume | Cost (USD) |
|---|---|---|---|---:|
| 2026-10-14 | orchestrator | One production AI answer while auditing `/search` | 1 question | ~0.02 |
| 2026-10-14 | autopilot | Content Autopilot e2e: video summaries, Claude Haiku 5.5 (local, 3 new videos, 35 min total) | 24,017 in / 6,294 out tokens | 0.0056 |
| 2026-10-14 | autopilot | Content Autopilot e2e: chunk embeddings, text-embedding-3-small (12 chunks) | 25,198 tokens | 0.0005 |
| 2026-10-14 | autopilot | Query embeddings for about 25 local test searches | ~600 tokens | <0.0001 |
| 2026-10-14 | autopilot | Citation proof: 3 AI answers through the existing `/api/answer/stream` (Sonnet 4.6 + Haiku 4.5 pros classifier). The route doesn't log usage, so this is estimated | ~3 × (8K in / 300 out) | ~0.08 |

**Running total:** ~$0.11 (autopilot: ~$0.09 of its $0.75 cap)
