# Advisor evaluation (P1)

This is the `advisor` squad's evaluation of "שאלו את בונים בית". Fifteen real questions went end to
end through the production pipeline (`POST /api/answer/stream`, `lib/advisor/*`) on 2026-10-15. To
re-run it, start a server and run `node scripts/advisor/eval.mjs <out.json> [--only=id,id] [--port=3111]`.
Each question makes one model call, about $0.018 including the pros classifier.

## Setup

| | |
|---|---|
| Index | `feature/platform` 914baec: 278 transcribed videos (1,774 segments with caption marks), 673 title-only videos (never used as sources), 714 articles (5,233 chunks) |
| Retrieval | Hybrid RRF (cosine plus IDF keywords) in `app/api/_lib/semantic.ts`. Up to 6 sources, at most 3 of them articles, with one citation number per document. The exact second comes from knowledge's `focusWindow`/`secondAt` |
| Answer model | `claude-sonnet-5-5`, adaptive thinking at effort `low`, `max_tokens` 1,600, cached system prompt, server-side refusal fallback |
| Follow-up rewrite | Heuristic first. `claude-haiku-5-5` (thinking off, effort `low`) runs only for ambiguous follow-ups |
| Pros | `app/api/_lib/pros.ts` (`claude-haiku-4-5`), region-aware |

## Results

Round 1 ran all 15 questions with the first prompt. After review, the prompt was tuned and round 2
re-ran six of the flagged cases. Round 3 re-ran the two cases that were still failing. Timings are
from the local dev server.

| # | Topic | Question | Sources (video + article) / cited | Top cos | Sources | First word | Done | Review |
|---|---|---|---|---:|---:|---:|---:|---|
| 1 | Cost / shell | כמה עולה שלד לבית של 200 מ״ר ב-2026? | 3 + 3 / 5 | 0.54 | 2.7 s* | 3.5 s* | 9.3 s* | ✅ The owner's figure is in bold: 800,000-850,000 ₪ before VAT (Ep. 109, 2026), cited [1]. Ep. 85's 2024 range is flagged as older. One reading of speech recognition: Ep. 109's "17 18" given as 1,700,000-1,800,000 ₪ |
| 2 | Permits | כמה זמן לוקח לקבל היתר בנייה לבית פרטי? | 1 + 3 / 1 | 0.64 | 0.54 s | 1.6 s | 5.5 s | ⚠️→✅ Grounded (6-18 months, from the July 2026 guide), but it closed with a sentence about what isn't covered, in round 2 as well. Clean in round 3 |
| 3 | Shell | מה חייבים לבדוק לפני יציקת בטון? | 2 + 3 / 5 | 0.56 | 0.84 s | 1.5 s | 8.1 s | ⚠️ Correct steps, cited per bullet. The transcript says "2ח סנטימטר" ("two and a half"), and the answer correctly gave 2.5 cm. But every round added a remark that the figure was unclear, and round 3 quoted "2ח" itself. Still open |
| 4 | Waterproofing | איך עושים איטום נכון למרתף? | 3 + 3 / 5 | 0.59 | 1.7 s | 2.3 s | 8.0 s | ✅ Preparation, spray vs sheets, backfill. The water bar is priced and dated (about 20 ₪ a metre, 2026) |
| 5 | Electrical | איך מתכננים את החשמל בבית חדש? | 0 + 3 / 3 | 0.58 | 0.47 s | 1.4 s | 7.1 s | ⚠️ Good content, but 5 bullets, one of them with a nested list of 4. Round 2 caps answers at 4 flat bullets, and all six re-run answers kept to it. This case was not re-run |
| 6 | Contractors | איך בוחרים קבלן שלד בלי להיכוות? | 2 + 3 / 5 | 0.50 | 0.62 s | 1.9 s | 7.7 s | ⚠️ Covers the spec, 3 bids, the contract, the payment schedule and insurance. But it had 6 bullets and a closing sentence about what isn't covered. Both are now prompt rules (rounds 2 and 3). Not re-run |
| 7 | Mortgage | איך עובדת משכנתא לבנייה עצמית? | 2 + 3 / 3 | 0.62 | 0.65 s | 1.3 s | 7.2 s | ✅ Staged payouts and how the bank views land vs build, with Ep. 110 cited |
| 8 | Finishes / cost | כמה עולה ריצוף לבית פרטי כולל חומר? | 2 + 3 / 3 | 0.63 | 0.57 s | 1.6 s | 5.6 s | ⚠️→✅ Reconciled two 2026 figures honestly, but computed a per-m² price. Round 2 quotes the sources only |
| 9 | Supervision | האם צריך מפקח בנייה? | 3 + 3 / 4 | 0.67 | 0.44 s | 1.1 s | 6.5 s | ✅ Law vs practice, a cost dated 2026, how to choose. This is knowledge's regression query, and the inspector videos now rank |
| 10 | Land / תב"ע | מה זה תב״ע ואיך בודקים אותה לפני שקונים מגרש? | 3 + 3 / 2 | 0.54 | 0.64 s | 1.3 s | 5.9 s | ✅ Answered from the articles, since the acronym now matches as one word. The videos were weak and stayed uncited |
| 11 | Little content | כמה עולה להתקין מעלית בבית פרטי? | 0 + 3 / 2 | 0.63 | 0.54 s | 1.4 s | 6.8 s | ✅ Honest: it had only 2019 figures, said prices have probably risen, and gave no 2026 figure |
| 12 | Off topic | מה המתכון הכי טוב לשקשוקה? | 3 + 3 / 0 | 0.49 | 0.53 s | 1.2 s | 3.2 s | ⚠️→✅ Declined in one friendly sentence with good follow-ups, but six unrelated cards stayed. From round 2 the model flags OUT_OF_SCOPE: the cards go and `refused` is tracked. That reply used an emoji, which round 3 banned. Not re-run after that |
| 13 | Follow-up | ומה לגבי חיפוי אבן לקירות החוץ? (after #8) | 1 + 3 / 3 | 0.64 | 0.50 s | 1.2 s | 6.7 s | ✅ Recognised as self-contained, so no rewrite. 2026 prices per m² and what to demand in a bid |
| 14 | Ask about a video | מה הנקודות הכי חשובות בסרטון? (Ep. 109) | 3 + 3 / 1 | 0.44 | 0.47 s | 1.5 s | 5.4 s | ⚠️ A sharp summary from Ep. 109's summary and passages, but the other five sources were unrelated. Round 2 added the video's title to the search. Ep. 107 (2026 costs) and Ep. 110 (building mortgage) joined, but two articles were still off topic. It also closed with a sentence about missing prices, which round 3 banned. Not re-run after that |
| 15 | Budget | איפה הכי קל לחרוג מהתקציב בבנייה? | 1 + 3 / 2 | 0.59 | 0.54 s | 1.2 s | 6.5 s | ⚠️→✅ Changes mid-build, windows, a missing estimate and a reserve, all dated. It ended with a closing gap sentence. Clean in round 2 |

\* This was the first request of the run, with a cold index and route compilation.

**Grounding.** No answer invented a price, a law or a name. Every figure carried a citation and a
date ("נכון ל-2026", "מאמר ממרץ 2026", "לפי פרק 109 של הפודקאסט").

**Citations.** I spot-checked them against the index:
- "800 850 ... לפני מעם" is in Ep. 109's passage.
- "850 800 שלדים היום" and "35% מעוגת הביצוע" are in Ep. 107's passage.
- The water-bar price (about 20 ₪ a metre, 2,000-3,000 ₪ for a 100 m² basement) is in the August 2026 waterproofing guide.

**Hebrew.** Natural, plural imperative ("בקשו", "בדקו"), in Tomer's practical tone. There is an
occasional awkward phrase, such as #1's heading "מה הגודל משפיע".

**Follow-ups.** There are 3 per answer, self-contained and answerable.

### Changes after review

| Round | Change | Re-run on | Result |
|---|---|---|---|
| 2 | Off-topic questions are flagged by the model (`OUT_OF_SCOPE` in the trailer): no sources, no pros, `refused: out_of_scope` in `answer_completed` | #12 | ✅ No cards. The reply had one emoji |
| 2 | Quote figures as given and never compute new ones | #8 | ✅ |
| 2 | A focused video's title joins the search query | #14 | Partly: 2 of the 5 other sources are on topic, up from none |
| 2 | 2 to 4 bullets, never nested | all six | ✅ |
| 2 | Mention a gap only for something asked, and never list other topics | #2, #14, #15 | #15 clean. #2 and #14 still closed with a gap sentence |
| 2 | Leave garbled transcript figures out without mentioning them | #3 | ❌ Still remarked on the figure |
| 3 | Never close with a sentence about what the sources don't cover | #2 | ✅ |
| 3 | Unclear figures: don't state, guess or explain them; at most, say to confirm with the engineer. No emojis | #3 | ❌ Gave 2.5 cm (right) but quoted the raw "2ח" |
| After 3 | Stray letters glued to a figure ("575,000ל", "10ה") are removed from the passages the model reads. A single digit fused to letters ("2ח"), or a figure followed by "ח"/"וח" (the start of "וחצי"), is kept: the digit alone would be a different figure | Unit tests, dry run | ✅ |

The first version of the last change, in 46ed150, dropped a single fused digit entirely. A free dry
run of #3 then showed the model would read "כיסוי בטון מלא של סנטימטר 2 סנטימטר", which points to 1-2
cm instead of 2.5. The index has about 100 such tokens. For example, "8ן" is "eighty", and "קרוב ל 4ה
מיליון" would have read "close to a million". They are now left as they are, which is the input the
model read correctly in rounds 1-3.

## Latency

These figures are for the 14 warm requests of round 1.

- **Retrieval:** 440-1,660 ms to the `sources` event, with a median of 540 ms and 12 of 14 under 0.7 s.
  Most of that is the query embedding. On the production build, warm, the source cards are on screen
  **884 ms after the page starts loading** (`/ask/?q=`: page, hydration, request, render).
- **First answer word:** 0.63-1.32 s after the sources, with a median of 0.72 s.
- **Whole answer:** 5.4-8.1 s, with a median of 6.7 s. The cold first request took 9.3 s and the short
  off-topic reply took 3.2 s.
- **Thinking setting:** measured on the demo question.
  - `between_tools` (Sonnet 5.5's lowest setting) at effort `medium` reached the first token 0.88 s and
    1.49 s after the sources, with answers of 163 and 174 words.
  - Adaptive at `low` took 0.96 s, with 134 words.
  - The orchestrator approved adaptive at `low`.

## Cost

- **Per answer:** $0.0164. Round 1's 15 answers cost $0.2465, and all 23 evaluation answers averaged
  $0.0164. The pros classifier adds about $0.0015 per question. The system prompt is read from the
  prompt cache after the first answer.
- **Prompt size, final prompt, demo question:** about 6,300 input tokens.
  - The system prompt is 1,676 tokens (4,748 characters).
  - The sources and question are 4,634 tokens.
  - Hebrew comes to about 1.42 characters per token.
- **The evaluation:** 23 answers across the three rounds cost $0.376, and their pros calls cost $0.034,
  for $0.410 in total. That is $0.01 over the $0.40 guideline. All advisor spend is in
  `docs/platform/API_SPEND.md`.

## Demo fixture

`/platform/demo/advisor/` replays `apps/web/lib/demo/fixtures/advisor-recording.json`. It was recorded
from the live pipeline against the final index on 2026-10-15 at 05:22 UTC, before the evaluation and
its prompt changes. The sources are:
- Ep. 109 [1] from 28:34 (1714 s, "בממוצע 800,000 שק").
- Ep. 107 [2] from 46:08.
- Ep. 85 [3] from 29:21.
- Three 2026 articles.

After the tuning, two more takes were recorded with the final prompt (10:07 and 10:08 UTC). All three
takes gave the same figure (800,000-850,000 ₪) and the same moments. The first take is the one kept:
- The second hedged a speech-recognition number awkwardly ("עד 17-18 (מאות אלפי ₪)").
- The third used 5 bullets and had a grammar slip ("לפי הקבלני").

The kept answer reads Ep. 109's "17 18" as "1.7-1.8 מיליון", the same reading as #1.

## Known limits

- **Retrieval confidence doesn't separate off-topic questions.** On-topic questions score a top cosine
  of 0.44-0.67, and the off-topic one scored 0.49. Off-topic answers rely on the model's flag, and the
  free pre-model refusal fires only below a cosine of 0.30. To find the questions the advisor couldn't
  answer, read `refused` and `cited` (the sources the answer actually used) together with `confidence`.
- **Unclear transcript figures** (#3). The model still remarks on them, and may quote the raw token. Its
  reading was right.
- **Rules checked only on re-run cases.** The bullet rule, the gap-sentence rule and the emoji rule were
  checked only on the cases that were re-run. #5, #6 and #12 were not re-run after their rule changed.
- **Cost questions.** Articles outrank transcripts in hybrid search. By design, the advisor shows video
  moments first, newest first.
- **Title-only videos.** Videos without captions never ground answers. A question that only they cover
  gets an article answer.
