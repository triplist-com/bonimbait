# Bonim Bait design system

The visual and interaction system for bonimbait.com (and bonimbayit.co.il after cutover). Owned by the
`design` squad; every other squad builds with it. Living style guide: **`/platform/design-system/`**
(noindex). Source of truth for values: `apps/web/app/globals.css` (CSS variables) mirrored in
`apps/web/lib/design/tokens.ts` (a test keeps them in sync).

---

## 1. Principles

1. **The owner's brand, elevated, not replaced.** Magenta `#E61559`, black and white, Tomer's photos,
   the podcast art and the owner's stage icons. We add warmth (sand, concrete), rhythm and craft.
2. **Tomer's voice: practical, "מהשטח", warm and direct.** No hype. Natural Israeli Hebrew in the plural
   imperative ("שאלו", "הצטרפו", "בנו").
   - Builder-facing headlines never say "AI". Say **"תשובה מהשטח"**. "בינה מלאכותית" is fine in small print.
   - Cost figures carry a date: **"נכון ל-2026"**.
3. **Question first.** The ask box is the front door. Every page leads to an answer, an exact video
   moment, or a person (pro, consultation, community).
4. **Warm and quiet.** Paper, sand and concrete surfaces; magenta only where it matters. One primary
   (magenta) button per region.
5. **Phone first.** 390 px is the main screen (the pitch is shown on a phone). 44 px touch targets, no
   accidental horizontal scroll, one floating action that never covers content.
6. **Fast and accessible by default.** WCAG 2.1 AA (IS 5568), LCP < 2.5 s on mobile, CLS 0, motion only
   when allowed.

---

## 2. Brand

### Audit (bonimbayit.co.il, 2026-10-14)

| Use on the live site | Hex | Token |
|---|---|---|
| Logo, icons, section highlights | `#E61559` | `primary-600` (= `primary` for backgrounds) |
| Elementor buttons and borders | `#E81359` | rendered as `primary-600` (indistinguishable) |
| Accent, Calendly embed (`#FC3565`) | `#FE3366` | `primary-500` |
| Hover | `#C4125E` | `primary-700` (= `text-primary`) |
| Pressed | `#A30F4E` | `primary-800` |
| Logo wordmark, body text | `#231F20` | `ink-900` (= `ink`) |
| Icon outlines | `#2E2F2E` | ≈ `ink-800` |

The live font is **Atlas** (AAA foundry, commercial, not redistributable). We use **Heebo** (variable,
100–900, `next/font`), the closest free Hebrew sans. Display weights (800) with tight tracking carry the
brand's presence. No second display face: one font file per script keeps the site fast.

### Assets (`apps/web/public/brand/`)

| File | What |
|---|---|
| `logo.svg` | Owner's wordmark ("בונים בית", 222×53). In code use `<Logo />` / `<LogoLink />` (currentColor, optional magenta first letter). |
| `monogram.svg` | The logo's "בּ" in white on magenta: favicon, app icons, small marks. |
| `stages/*.svg` | The owner's two-tone stage icons (ink `#302F2D` + magenta `#EF3D69`), one per build stage (`lib/stages.ts`). |
| `tomer-trailer-poster.jpg` | Poster of the channel trailer (YouTube `gUrvdx_xZjM`), the homepage hero visual. |
| `favicon-owner.png` | The live site's favicon, for reference. |

Team photos (white background cut-outs) and testimonial clips live in Supabase Storage
(`uploads/mp-v6/team/*`, `uploads/mp-v6/videos/*`); see `lib/commerce/membership-content.ts`.

---

## 3. Tokens

### Colour

Every colour is a CSS variable holding RGB channels (`--bb-primary-600: 230 21 89`), so Tailwind opacity
works (`bg-primary/10`).

| Scale | Use | Notes |
|---|---|---|
| `primary-50…950` | Brand magenta | `600` = logo. Buttons `bg-primary-600 hover:bg-primary-700 active:bg-primary-800`. |
| `ink-50…950` | Warm concrete neutrals, `900` = brand ink | Text: `ink-900` primary, `ink-600` secondary (7.3:1), `ink-500` muted (4.9:1). `ink-400` is for icons and placeholders only (3.2:1). |
| `sand-50…900` | Limestone, plaster | Warm section bands (`sand-50`), cards (`sand-100`), dates/tags (`sand-800` on `sand-100`). |
| `success / warning / danger / info` | Semantic | Text `-700` on `-50` (all ≥ 5.6:1). Fills `-600`. Always with an icon or words. |
| `whatsapp`, `whatsapp-bubble` | Third-party brand | Always **dark text** on WhatsApp green (white is 2:1). |

**Roles:** `paper` (page plane `#FAF8F5`), `surface` (white), `line` / `line-subtle` (borders), `link`
(`primary-700`), `focus` (`primary-600`).

**Legacy names reskin automatically** (no markup change needed): `primary-*` blue → magenta,
`secondary-*` amber → ink, `gray-*` / `neutral-*` cool → warm ink.

**Text-only AA overrides** (`tailwind.config.ts` → `textColor`):
- `text-primary` = `primary-700` (the logo magenta is 4.55:1 on white but ~4.2:1 on paper/sand).
  Need the exact logo colour for large text (≥ 24 px)? Use `text-primary-600`.
- Legacy `text-gray-400` / `text-neutral-400` = `ink-500`.

Never hard-code hex or Tailwind palette colours (`blue-*`, `amber-*`, `emerald-*`). If a colour is
missing, add a token here first.

### Typography

| Class | Size | Weight / leading | Use |
|---|---|---|---|
| `text-display-xl` | 40 → 72 px (fluid) | 800 / 1.04 / -3% | Homepage H1 only |
| `text-display` | 36 → 56 px | 800 / 1.08 | Page H1 (archives, directory) |
| `text-headline` | 28 → 40 px | 800 / 1.15 | Section titles (H2) |
| `text-headline-sm` | 24 → 30 px | 800 / 1.2 | Sub-sections, article H1 on small templates |
| `text-title-lg` | 22 px | 700 | Card and dialog titles |
| `text-title` | 18 px | 700 | Card titles |
| `text-title-sm` | 16 px | 700 | List items, small cards |
| `text-body-lg` | 19 px | 1.75 | Intros, hero subline |
| `text-body` | 16 px | 1.75 | Default text |
| `text-body-sm` | 15 px | 1.65 | Secondary text, forms |
| `text-caption` | 13 px | 1.45 | Hints, fine print, dates |

Long-form articles use `.bb-prose` (`components/content/article.css`), already on tokens.

### Shape, elevation, motion

- **Radii:** `rounded-lg` 8 (small controls) · `rounded-xl` 12 (buttons, inputs) · `rounded-2xl` 16
  (small cards) · `rounded-3xl` 24 (cards, media) · `rounded-4xl` / `rounded-[2rem]` 32 (bands, hero
  media) · `rounded-full` (chips, avatars).
- **Shadows** (warm ink, never pure black): `shadow-xs`, `shadow-card`, `shadow-card-hover`,
  `shadow-lift` (floating panels), `shadow-dialog`, `shadow-brand` (magenta glow under primary CTAs).
- **Motion:** durations `fast` 150 / `base` 200 / `slow` 300 / `slower` 500 ms; easing `ease-out`
  `cubic-bezier(0.16,1,0.3,1)` for entrances, `standard` for state changes. **CSS only.**
  `prefers-reduced-motion` turns animations and transitions off globally (`globals.css`); use
  `motion-safe:` for anything decorative (e.g. `motion-safe:animate-float`).

---

## 4. Data-viz palette (dashboards)

For the Command Center, pro portal and partner dashboards. Values in `lib/design/tokens.ts` → `dataViz`.

**Categorical (assign in this order, never cycle; a 9th series folds into "אחר"):**

| Slot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Hex | `#E61559` | `#2A78D6` | `#D18F00` | `#008300` | `#8A6FDF` | `#199E70` | `#6250D6` | `#EB6834` |
| Hue | brand magenta | blue | amber | green | lavender | aqua | violet | orange |

Validated with the dataviz checks (OKLab ΔE×100, Machado 2009 CVD simulation) on white and paper:
worst adjacent CVD ΔE **10.0** (target ≥ 8), normal vision **24.8** (floor 15); the first **three** slots
pass the all-pairs test (CVD 12.4), so scatter plots and maps use at most three series. Slot 3 (amber) is
2.75:1 on white: a chart that uses it must show direct labels or a table.

- **Sequential** (magnitude): `primary-100 → primary-900`. For ordinal steps (funnel stages) start at 300.
- **Diverging**: blue `#194F91 #2A78D6 #86B6EF` ← neutral `ink-100` → magenta `primary-300/600/800`
  (under budget ↔ over budget).
- **Status** (reserved, never a series colour, always icon + label): good `success-600`, warning
  `warning-500`, serious `#EC835A`, critical `danger-600`.
- **Chrome:** gridlines `ink-100`, axis `ink-300`, labels `ink-500`, values `ink-900`. Text never wears
  the series colour. One y-axis per chart. 2 px gaps between stacked segments.

---

## 5. Components (`apps/web/components/ui/`)

All typed, RTL-correct, server-safe unless marked *(client)*. Icons: **`lucide-react` 1.48.0**
(pinned). Brand logos (WhatsApp, YouTube…) are in `SocialIcon` because lucide v1 has none.

```tsx
import { Button, ButtonLink, buttonClasses } from '@/components/ui/Button';
<Button>שאלו</Button>                                    // primary
<Button variant="secondary" size="lg" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>לכל הסרטונים</Button>
<Button loading>שולחים</Button>                           // disabled + spinner + aria-busy
<Button asChild variant="outline"><Link href="/calculator/">למחשבון</Link></Button>
<ButtonLink href="/recommended/" variant="link">לכל בעלי המקצוע</ButtonLink>
<summary className={buttonClasses({ variant: 'ghost', size: 'sm' })}>…</summary>
```
Variants: `primary` · `secondary` (ink) · `outline` · `ghost` · `link` · `inverse` (on magenta/ink).
Sizes: `sm` 36 · `md` 44 · `lg` 48 · `xl` 56 px.

| Component | Use | Snippet |
|---|---|---|
| `IconButton`, `IconLink` | Icon-only actions (label required → aria-label + title) | `<IconButton label="שמירה" icon={<Heart />} variant="outline" round />` |
| `Card`, `CardLinkTitle` | Surfaces (`white`, `sand`, `ink`, `brand`, `outline`); whole-card links via a stretched title link | `<Card as="li" interactive>…<CardLinkTitle href={href}>{title}</CardLinkTitle></Card>` |
| `Badge` | Non-interactive labels, status with `dot` | `<Badge tone="success" icon={<CircleCheck />}>בתקציב</Badge>` |
| `Chip`, `ChipLink` | Filters (`aria-pressed`), suggested questions | `<ChipLink href={aiHref(q)} size="sm">{q}</ChipLink>` |
| `Avatar` | People and logos, initials fallback, next/image when possible | `<Avatar name="תומר חן ריחאנה" src={url} size="lg" />` |
| `Container`, `Section`, `SectionHeader` | Layout rhythm | `<Section tone="sand" labelledBy="x"><SectionHeader id="x" eyebrow="…" title="…" highlight="…" action={{ href, label }} /></Section>` |
| `PageHeader` | Top band of archive/hub pages (one H1) | `<PageHeader crumbs={<Breadcrumbs crumbs={c} />} eyebrow="…" title="…" description="…" />` |
| `Stat` | Big numbers (LTR-isolated) | `<Stat value="806" label="מאמרים" />` |
| `Tabs` *(client)* | WAI-ARIA tabs, arrow keys follow reading direction | `<Tabs label="סוג תוכן" tabs={[{ id, label, content, count }]} />` |
| `Accordion` | `<details>` based, works without JS, `name` for exclusive | `<Accordion items={[{ id, title, content }]} name="faq" />` |
| `Dialog`, `Sheet`, `Drawer` *(client)* | Native `<dialog>`: focus trap, Escape, backdrop, scroll lock, focus return. `Sheet side="end"` = left in RTL; `Drawer` = bottom sheet | `<Dialog open={open} onClose={close} title="…" description="…" footer={…}>…</Dialog>` |
| `Field` + `Input` / `Textarea` / `Select` | Label, hint, error wired with `aria-describedby` / `aria-invalid` | `<Field label="טלפון" hint="…" error={err} required><Input type="tel" dir="ltr" /></Field>` |
| `Checkbox`, `Radio`, `Switch` | Native inputs; `card` option tiles | `<Radio name="plan" card label="בונים תקציב" description="…" />` |
| `Tooltip` *(client)* | Supplementary text on hover/focus, Esc dismisses (never essential info) | `<Tooltip content="…"><IconButton … /></Tooltip>` |
| `Toast` *(client)* | `ToastProvider` + `useToast().toast({ title, tone })`, polite live region | |
| `Skeleton`, `SkeletonText`, `SkeletonCard`, `LoadingRegion` | Loading states | |
| `EmptyState` | Nothing here yet / no results, with a way forward | `<EmptyState icon={<Heart />} title="…" actions={<ButtonLink …/>} />` |
| `Steps`, `Progress` | Flows and journey progress (`startAt` for slices) | `<Steps steps={[{ label }]} current={2} />` |
| `VideoThumb` | Thumbnail + play + duration (`sizes`, `priority`, `badge`) | `<VideoThumb src={thumb} duration={543} badge={<Badge tone="glass">פרק 112</Badge>} />` |
| `YouTubeFacade` *(client)* | Poster first, player on click; `start`, `playing` | `<YouTubeFacade youtubeId={id} title={t} poster={img} priority />` |
| `SmartImage` | Fill image: next/image when the host is configured, `<img>` otherwise | `<SmartImage src={src} alt="" sizes="(min-width:1024px) 26rem, 100vw" />` |
| `RatingStars` | Half-star ratings (CSS mask, 2 spans) | `<RatingStars value={9.2} scale={10} count={6} />` |
| `Logo`, `LogoLink`, `SocialIcon` | Brand marks | `<Logo accent className="h-9 text-white" />` |

Product components built on these: `components/Layout/Header|Footer`, `components/ask/AskForm`
(the question box), `components/leads/ConsultationCTA` (stable API, now on `Button`/`Dialog`),
`components/home/*` (homepage sections and slots).

---

## 6. Layout patterns

- **Container:** `.container-page` / `<Container>` = `max-w-7xl`, 16 px gutters on phones, 24/32 px up.
- **Section rhythm:** `py-14 sm:py-20`. Tones: `paper` (base), `white` (separation), `sand` (warm
  feature bands), `ink` (stage moments: media rails, hub teaser, footer). At most one dark band per screen.
- **Rails on phones:** `className="rail"` on a list, items `w-[72–82%]`, so the next card peeks. From
  `lg` the same list becomes a grid (`lg:grid lg:grid-cols-4 lg:overflow-visible`).
- **Cards:** `rounded-3xl border border-ink-100 bg-white shadow-card`, hover
  `-translate-y-0.5 shadow-card-hover`. The title is the link (stretched `after:absolute after:inset-0`).
- **Header** (`lib/nav.ts`): fixed with a spacer (no CLS), condenses on scroll; utility bar (community,
  phone, account) on desktop; ask + menu sheets on phones.
- **Floating action:** exactly one, mounted by the layout (`<ConsultationCTA variant="floating" />`). It
  opens a sheet (consultation, WhatsApp, ask, call). "Quick return": it **appears only when the visitor
  scrolls up** (looking for something to do), lingers 3.5 s, and is hidden over the hero, while reading
  (scrolling down), at rest, and whenever an element with `data-floating-cta="hide"` is visible. Put that
  attribute on CTA bands, forms and anything the button must not cover (the footer, banner and card CTAs
  already have it). Logic: `lib/ui/floating-action.ts` (tested).
- **CTA bands:** one per page end (`FinalCTA`, `ConsultationCTA variant="banner"`).

### Config you extend instead of editing components

| Need | Edit |
|---|---|
| A nav destination | one line in `PRIMARY_NAV` / `SECONDARY_NAV` / `FOOTER_COLUMNS` (`lib/nav.ts`) |
| The advisor route (Wave B `/ask/`) | `AI_ENTRY.href` in `lib/nav.ts`; links use `aiHref(question)` |
| The advisor's display name | env `NEXT_PUBLIC_ADVISOR_NAME` (default "שאלו את בונים בית") |
| "הבית שלי" destination | `ACCOUNT_NAV.home.href` (today `/account/`) |
| Community numbers, channels, phone | `lib/brand.ts` |
| Build stages (label, category, profile stage, icon) | `lib/stages.ts` (`BUILD_STAGES`) |
| Homepage copy | `lib/home/content.ts` |

Wave B slots on the homepage: `components/home/HubTeaserSlot.tsx` (props or a `preview` node) and
`components/home/BudgetCalculatorSlot.tsx` (`href`, copy). Replace their content via props; keep the
section placement.

---

## 7. Imagery and media

- Use the owner's real material: Tomer and the team (white cut-outs), podcast art, video thumbnails,
  the stage icons. No stock "AI" imagery, no fake people. Demo people are fictional and say so.
- **LCP:** the one hero image per page gets `priority` (via `SmartImage`, `YouTubeFacade`,
  `TrailerFacade`). Everything else is lazy. Give every image a container with a fixed aspect ratio
  (`aspect-video`, `aspect-[16/10]`, `aspect-[4/3]`, `aspect-[9/16]`) so nothing shifts.
- **Video:** never autoplay a player or embed an iframe on load. Use `YouTubeFacade` / `VideoTestimonial`
  (poster + play). Timelines inside players stay left-to-right (`dir="ltr"`).
- **next/image:** used when the host is in `next.config.mjs` `images.remotePatterns` (checked by
  `lib/images.ts`), with AVIF/WebP. Vercel bills image transformations; volumes are modest
  (≈1,000 source images) but keep `sizes` honest.
- **Alt text:** decorative images `alt=""`; content images describe the content in Hebrew; logos
  `לוגו <name>`.

---

## 8. Hebrew typography and RTL rules

- `<html lang="he" dir="rtl">`. Use **logical** properties only: `ms/me`, `ps/pe`, `start/end`,
  `border-s/e`, `rounded-s/e`, `text-start`. Never `left/right`, `ml/mr`, `pl/pr` (except inside
  explicit `dir="ltr"` islands such as video timelines and code).
- **Directional icons:** "forward" is `ArrowLeft`; add `ltr:rotate-180` so it flips if a page is LTR.
  Chevrons for disclosure (`ChevronDown`) don't flip.
- **Numbers, prices, phones, emails, URLs** inside Hebrew go in `.num` (LTR isolate + tabular figures)
  or `dir="ltr"`: `<span className="num">50,000+</span>`, `<a dir="ltr" href="tel:…">`. Prices from
  `formatPrice()` (he-IL Intl) already order correctly; don't wrap those in `.num`.
- Hebrew has no capitals: emphasis is **weight and colour** (eyebrows are bold magenta, not uppercase,
  no letter-spacing). Headings 700–800, body 400, line-height 1.7–1.8 for body text.
- Keep headlines short; `text-wrap: balance` is on by default for h1–h6.
- Quotes: use `"` or `״`/`׳` per Hebrew convention; dates in Hebrew (`formatHebrewDate`).
- **Satori (OG images) has no bidi:** pre-order Hebrew with `lib/og/rtl.ts`, one line per element.

---

## 9. Accessibility (WCAG 2.1 AA / IS 5568)

- Contrast: body text ≥ 4.5:1, large text and UI ≥ 3:1. Use the text tokens above; `lib/design/contrast.ts`
  has `contrastRatio()` / `meetsAA()` for dynamic colours.
- One `<h1>` per page; headings in order (a card after the H1 uses `<h2>`). Sections get
  `aria-labelledby` (`<Section labelledBy>`).
- Focus: visible magenta ring on everything (`:focus-visible` in `globals.css`); overlays trap focus and
  return it. Skip link "דלגו לתוכן הראשי" in the layout.
- Touch targets ≥ 44 px for primary controls, ≥ 24 px for everything else.
- Icon-only controls need a label (`IconButton label`). Colour is never the only signal (status badges
  carry icons and words; star ratings have a text label).
- Motion respects `prefers-reduced-motion`. Live regions for async results (`Toast`, `LoadingRegion`).

---

## 10. Performance rules

- Pages are Server Components and static/ISR by default; client components are leaves.
- No session reads on the server in shared layout (keeps ISR). The header uses `useAuthState`
  (cookie-first; supabase-js loads only for signed-in visitors).
- No heavy libraries; icons are tree-shaken lucide. Prefer CSS over JS for motion.
- Budgets (Lighthouse mobile): performance ≥ 90, accessibility 100, CLS 0, LCP < 2.5 s.
  Measured on the production build (Lighthouse 13.5, 2026-10-14):

  | Page | LCP, applied throttling | LCP, simulated (PSI) | Perf | A11y |
  |---|---|---|---|---|
  | Home | 1.7 s | 3.0 s | 93 | 100 |
  | Article | 1.6 s | 2.8 s | 95 | 100 |
  | Video (legacy) | 1.6 s | 2.0 s | 99 | 100 |
  | Video (indexed) | 1.6 s | 2.9 s | 94 | 100 |
  | Business | 1.7 s | 2.1 s | 99 | 100 |
  | bonimbayit.co.il home (same settings) | 4.1 s | 5.2 s | 70 | 73 |

---

## 11. Do and don't

| Do | Don't |
|---|---|
| `bg-primary-600 text-white` for the one main action | Two magenta buttons side by side |
| `text-ink-600` for secondary text | `text-ink-400` / `text-gray-400` for small text (fails AA) |
| `sand-50` / `paper` bands with a blueprint grid for warmth | Pure grey `#f3f4f6` backgrounds, cold blues |
| "תשובה מהשטח", "שאלו", "הצטרפו" | "AI-powered", "בינה מלאכותית" in a headline, singular imperative |
| Prices with a date ("נכון ל-2026") and "לא כולל מע״מ" where relevant | Undated cost claims |
| `ms-2`, `start-3`, `ltr:rotate-180` | `ml-2`, `left-3`, hard-flipped arrows |
| Facades for video, `priority` on one image | Autoplaying video, eager iframes, 23 MB hero files |
| Add a nav item in `lib/nav.ts` | Hard-code links in the header/footer |
| Tokens and `components/ui` | New hex values, `blue-*`/`amber-*`/`emerald-*` classes |
| `data-floating-cta="hide"` on CTA zones | A second floating button, or one that sits over text at rest |
