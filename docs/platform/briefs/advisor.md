# Brief: `advisor` (P1, Must). Dev port 3111. Migration slot `20261014120000`–`20261014120959`. API cap $1.00

You own the AI Advisor. It is the hero of the demo:
- It's the first thing the owner sees on his phone.
- It's the reason builders come back.

Read first:
- `docs/platform/PROGRAM.md`, all of it, especially §3.1 (the P1 row and the copy rules) and §6 (the project-file contract).
- `docs/platform/DESIGN_SYSTEM.md`
- `docs/platform/FOUNDATION.md` (track, guards, demo views)
- `docs/platform/AUTOPILOT.md`: runtime fusion in `semantic.ts`.

## Today

| Area | State |
|---|---|
| `/api/answer/stream` | Retrieves via `app/api/_lib/semantic.ts` (`semanticSearch`, RRF over cosine + IDF keyword, static + runtime stores). Sends 5 sources (≤3 articles) to `claude-sonnet-4-6`. Streams SSE `{type:'chunk'}` then `{type:'done', sources}`. Already guarded by `checkAiBudget` / `recordAiUsage` and rate-limited. |
| `/search/` AI card | Weak: `components/AiAnswer.tsx` and `lib/hooks/useStreamingAnswer.ts` render a one-liner with raw `**` markdown. |
| Pros | `app/api/_lib/pros.ts` classifies the question's specialty with Haiku 4.5 and lists 3 pros. |
| Legacy | `/api/answer` and `/api/answer/pregenerated`, plus their `lib/api.ts` callers, proxy to the dead FastAPI backend and return 502. **Remove them, or re-implement them in-process.** Nothing may call `BACKEND_URL`. |
| Index | The `knowledge` squad is still growing the static index toward the full channel. Build against whatever index is present. |

**Hebrew gotcha:** never strip single-letter Hebrew prefixes from query tokens.

## Build

### 1. `/ask/` advisor page
- Accepts `?q=` and is shareable.
- The display name comes from `NEXT_PUBLIC_ADVISOR_NAME`. The default is "שאלו את בונים בית"; "שאלו את תומר" is pending the owner's approval.
- Mobile-first: it's demoed on a phone at 390px.

### 2. Sources first, then the answer
- Run retrieval first. Stream an early `{type:'sources'}` event so the source cards render immediately, with a "מצאנו N רגעים ב-M סרטונים ומאמרים" line.
- Then stream the answer.
- The first visible change must come in under 1.5s.

### 3. Exact moment playback (the headline wow)
- **Video source cards:**
  - thumbnail;
  - title;
  - a "▶ צפו מ-12:34" button;
  - the quoted segment text.
- **Playback:** clicking plays inline with a lite YouTube facade and `start=<seconds>`, without leaving the page.
- **Citations:** `[1]`, `[2]` render as chips that scroll to and highlight the source.
- **Article sources:** title, excerpt and link.

### 4. Answer quality
- **Markdown:** safe rendering, with no raw HTML. Supports bold, lists, short headings and cost tables. Numbers LTR.
- **Prompt rules:**
  - answer only from the sources;
  - date every cost figure from the source's publish date ("נכון ל-2026");
  - cite with `[n]`;
  - be concise, practical, and in Tomer's "מהשטח" tone;
  - include the disclaimer "לא תחליף לייעוץ מקצועי" in small print.
- **Refusals:** if retrieval confidence is low, or the question is outside home building, say so honestly and offer related topics plus a consult.
- **Analytics props:** emit `top_similarity`, `confidence` and `n_sources` in the `answer_completed` props. The `command` squad's "השאלות שעוד לא עניתם עליהן" depends on them.

### 5. Follow-ups
- Up to 3 follow-up chips, produced **in the same model call** as a parsed trailer. No extra API call.
- Clicking a chip asks it in the same thread.

### 6. Multi-turn
- Keep the conversation history (last ~4 turns).
- Retrieval uses a rewritten standalone query for follow-ups. Use a heuristic first; use the cheapest model only when the follow-up is ambiguous.
- Threads persist:
  - **anonymous visitors:** in localStorage;
  - **members:** in DB (`advisor_threads` / `advisor_messages`, RLS owner-only, staff aggregate read).

### 7. Lead moments
Contextual cards after the answer, mapped to the owner's products:
- **Consult:** reuse the existing `components/leads/ConsultationCTA`. The `revenue` squad is upgrading it to a booking flow that carries the project file, so don't fork it.
- **Planner:** "תקציב ראשוני ב-3 דקות" → `/calculator/` (when the question is about costs).
- **Pros:** region-aware.
- A placeholder slot for partner offers (wired at integration).
- Track `lead_cta_shown` and `lead_cta_clicked`.

### 8. Sharing
- "שתפו בוואטסאפ" (wa.me text plus a link) and "העתיקו קישור".
- Shared answer snapshots live at `/ask/a/<id>/`: read-only, noindex for now, opt-in on share.

### 9. Project-file producer
Write `bb.advisor.recent` (the last 10 `{q, at}`) to localStorage, exactly as specified in PROGRAM.md §6.

### 10. Analytics
Emit these events via `track()`:
- `answer_feedback` (👍/👎 plus an optional reason);
- `followup_clicked`;
- `source_clicked`;
- `video_play`;
- the share events. Add them to the catalog if needed.

### 11. Entry points
- **Header AI entry** → `/ask/`. Change the target in `lib/nav.ts`.
- **Homepage hero input** → `/ask/?q=`.
- **"שאלו על הסרטון"** on video pages: retrieval boosted to that video. The `autopilot` squad already added `components/autopilot/AskAboutVideo.tsx`; reuse or generalise it.
- **"שאלו על המאמר"** on articles.
- **`/search/`:** keep the results grid, and replace the AI card with a compact answer preview plus "המשיכו לשאול".

### 12. Models
- Invoke the `claude-api` skill first. The pricing map is in `lib/guard/aiPricing.ts`.
- Use the best current Sonnet-class model if one answer costs ≤ ~$0.02. Otherwise stay on 4.6.
- Use Haiku-class for classification and rewrites.
- Use prompt caching for the system prompt.
- Record usage on every call.

### 13. Demo view `/platform/demo/advisor/`
A replay of the headline Q&A "כמה עולה שלד לבית של 200 מ״ר ב-2026?", built from a fixture you generate **once** with a real call.
- Use real sources and real youtube ids and timestamps from the index. Podcast Ep. 109 (`vluNH7GTkU4`) and Ep. 107 (`X78Yo_sJgIM`) should rank.
- It streams with a typing effect and costs $0 during the demo.
- Add a "נסו בעצמכם" button that goes to live `/ask/`.

### 14. Evaluation
- Run 10–15 real questions end to end (≤ $0.40): costs, permits, shell, waterproofing, electrical, contractors, mortgage, finishes.
- Review grounding, citation correctness, Hebrew quality, dated figures and refusals. Iterate on the prompt.
- Save the results to `docs/platform/ADVISOR_EVAL.md`.

## Quality bar
- It must feel faster and smarter than anything the owner has seen in Hebrew.
- Run every charter gate. Write unit tests for:
  - the trailer parser;
  - the citation mapper;
  - markdown safety;
  - query rewrite;
  - the confidence calculation.
- Screenshots, desktop and mobile: `/ask/` mid-stream and finished, with a video playing inline, plus `/search/` and `/platform/demo/advisor/`.
