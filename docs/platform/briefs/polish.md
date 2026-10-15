# Brief: `polish` (Wave C). Dev port 3122. Migration slot: none. API cap $0.10

You are the final design pass, the difference between "very good" and "AMAZING". Six squads built features
in parallel. Your job is to make the whole platform feel like one product, designed by one hand, in the owner's
brand, and perfect at 390px.

Read first:
- `docs/platform/PROGRAM.md`: §3.1 copy rules and §7 definition of done.
- `docs/platform/DESIGN_SYSTEM.md`
- every brief in `docs/platform/briefs/`, so you know the intent behind each screen.

## Scope
1. **Consistency audit.** Screenshot every public page and every new platform page, desktop 1440 and mobile 390:
   - home, `/ask/`, `/search/`, article, both video types, category and blog archives;
   - `/recommended/` and business pages, `/calculator/` (each step plus the result and report);
   - `/my-home/` (onboarding plus dashboard), `/partner-portal/`, `/membership-tiers/`, login and signup;
   - `/platform/`, `/platform/tour/`, every `/platform/demo/*`;
   - the main admin screens.

   For each, fix:
   - off-system styling: ad-hoc colours, spacing, radii, or buttons that aren't the `components/ui/*` primitives;
   - inconsistent headings or empty states;
   - missing loading skeletons;
   - jank;
   - awkward Hebrew wrapping;
   - overflow at 390px;
   - touch targets under 44px;
   - weak contrast.
2. **The wow details.**
   - Micro-interactions on the key moments: the streaming answer, the exact-moment playback, the onboarding reveal, the planner result, the booking confirmation.
   - Tasteful motion, respecting reduced motion.
   - Make the demo path in PROGRAM.md §3.1 feel seamless on a phone.
3. **Homepage.**
   - The mobile homepage is very long (~13,000 CSS px). Tighten it: keep the strongest sections, collapse or merge the weaker ones.
   - Fix the counts copy: "שעות צפייה" should be "שעות וידאו" or "שעות תוכן".
   - Ensure the counts reflect the final index.
4. **Branded system pages.** 404, 500, empty search results, and the offline/over-budget AI message.
5. **Share and OG.** OG images for home, `/ask/` answers, the planner result and `/platform/`. Check how links preview on WhatsApp: title, description, image.
6. **Copy pass.** Tomer's voice, plural imperative, no hype, no "AI" in builder-facing headlines, consistent feature names.

## Process
- Branch `feature/platform-polish`.
- The `qa` squad works in parallel on tests and security fixes. Avoid broad refactors of logic. Keep your edits to UI and copy, in small, reviewable commits.
- Include before/after screenshots of every page you changed in your report.
- Run every charter gate.
