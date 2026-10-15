# Brief: `pitch` (sales experience). Dev port 3116. Migration slot `20261014125000`–`20261014125959`. API cap $0.20

You own the experience that sells the platform to the owner of bonimbayit.co.il:
- the **owner-facing pitch site** at `/platform/`;
- the **guided demo tour**;
- the **private sales kit** for Dror.

## Read first
- `docs/platform/PROGRAM.md`, all of it.
- `docs/platform/DESIGN_SYSTEM.md`
- `docs/platform/FOUNDATION.md`, which covers the `/platform` shell, the pitch gate, and the demo-view registry in `lib/demo/views.ts`.
- The private strategy in the main checkout, `/Users/drorkashi/Projects/bonimbayit/sales/`:
  - `STRATEGY.md`, especially §2 positioning, §3 switch triggers, §4 objections, §5 ROI, §7 the 15-minute demo storyline, §8 Hebrew messaging, and Appendix A (deck changes).
  - `RESEARCH.md`
  - `roi_model.py`

## Hard rule: public vs private
- **The repo is public.**
  - Never put any of these in code or commits: Dror's prices or offer, the owner's estimated revenue, negotiation notes, or anything labelled private in `sales/`.
  - The pitch site may use the owner's **public** facts: video, episode and article counts, plan prices from his public pages, partner tier prices from /strategic-partners/, and his own public quotes.
  - It may also use measured facts about our platform.
- Everything private goes to `/Users/drorkashi/Projects/bonimbayit/sales/` (gitignored). Write it straight into the main checkout path, not your worktree.

## Build (public, in the repo)

### `/platform/`: the pitch site
Hebrew and RTL, in the owner's brand. Presented on a laptop and on a phone. The sections:
1. **Hero.** Use one of the headline options in STRATEGY.md §8.1, pick the strongest, then the tagline "בונים בית OS — מהשאלה הראשונה ועד המפתח". Open with his own quote, as in §7.
2. **"העסק שלכם במסך אחד".** Live counts computed from our data (videos indexed out of channel total, hours, episodes, articles, pros), plus his public price points.
3. **The pillars.** Use the §8.2 names and value lines. Each pillar card has:
   - "פתחו הדגמה" → its `/platform/demo/<view>/` (from the registry; hidden until the view is `'ready'`);
   - "פתחו באתר" → the real feature.
4. **"מעבר בלי סיכון".**
   - The URL-parity proof: 1214/1214. Generate a small committed JSON summary, counts only. The raw report is `data/migration/parity_report.csv` in the main checkout.
   - Old vs new speed. Measure mobile LCP for `https://bonimbayit.co.il/` and for our new homepage (local production build with `next start`; label it as such) with Lighthouse in the scratchpad Playwright Chromium, or `npx lighthouse` with `--chrome-path`. Show the date and method.
   - Content migrated: 806 posts, 188 video pages, 158 businesses, 240 reviews.
   - The Hebrew admin.
   - Rollback and parallel run.
5. **Interactive ROI calculator.** Use STRATEGY.md §5's base case as defaults. Inputs:
   - monthly sessions;
   - % identified;
   - % qualified;
   - % that book a consult;
   - consult → plan conversion;
   - plan mix;
   - partner MRR uplift.

   Outputs are **the owner's** extra consults, plans and ₪ per year. **Don't show our price or the platform cost.** Present it as a "your numbers" tool, not a promise.
6. **The switch plan.** A timeline (2-week parallel run, cutover, 30-day WordPress fallback), an FAQ that answers §4's objections, and a contact CTA to Dror (`NEXT_PUBLIC_PITCH_CONTACT_WHATSAPP` / `…_EMAIL` env vars, hidden when unset).

### `/platform/tour/`: the guided 15-minute demo
- It follows STRATEGY.md §7 beat by beat. For each beat: the screen, an "פתחו" button, key lines, and the number to show.
- A presenter-notes toggle.
- Works on a phone.

### Supporting work
- **OG image** for `/platform/` and `/platform/tour/`: Hebrew and branded. Dror will send the link on WhatsApp.
- **Navigation:** keep the `/platform` shell's nav (`lib/platform/nav.ts`) coherent: סקירה · סיור · הדגמות · מערכת עיצוב.

## Build (private, in `sales/`)
1. **`DEMO_SCRIPT.md`.** The final 15-minute script. For each beat: exact URLs, what to click, what to say (in Hebrew), the number to show, and the fallback if something fails. It also has:
   - a pre-meeting checklist: warm the advisor answer, check the demo views, set `PITCH_ACCESS_CODE`, charge the phone;
   - a discovery-question list (STRATEGY Appendix B).
2. **The deck, v3:** `sales/בונים בית OS - מצגת.pptx`.
   - Invoke the `anthropic-skills:pptx` skill.
   - Rebuild the existing deck at the repo root (`בונים בית 2.0 - מצגת מוצר.pptx`) with STRATEGY Appendix A's changes: Hebrew RTL, the owner's brand, about 12 slides.
   - Include real screenshots of the platform: take them from the running app, desktop plus mobile frames.
3. **`ONE_PAGER.md`.** A Hebrew leave-behind. Also export it as a PDF (`ONE_PAGER.pdf`) if you can; the `anthropic-skills:pdf` skill may help.
4. **`OUTREACH.md`.** A short WhatsApp and email message from Dror to Tomer and Tzuri, with the link and the hook.
5. **`OFFER.md`.** Dror's offer sheet, from STRATEGY §9, for Dror's eyes only.

## Quality bar
- This is the first impression. It must be the most beautiful page on the site, and it should feel inevitable: "this is already mine".
- **Facts and labels:**
  - Every number is real (computed or measured) or clearly labelled as an example.
  - Fixture numbers are never presented as his.
- **Demo resilience.** Other squads' demo views go `'ready'` as they merge. Your pages must degrade gracefully while views are pending: hide or "בקרוב".
- **Gates:** every charter gate. Add tests for the ROI math and for the registry-driven pillar links.
- **Screenshots:** desktop and mobile, full page, of `/platform/` and `/platform/tour/`.
- **Final report:** also list every private file you created in `sales/`.
