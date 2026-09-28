# Migrated HTML: sanitize rules and loader notes

`load.py` passes every crawled HTML field through `sanitize.py:sanitize_html()`:
`posts.content_html`, `pages.content_html`, `video_pages.body_html`,
`businesses.description_html` and `products.description_html`.
The original HTML isn't stored in the DB. It stays in `data/migration/*.json`.

## What the renderer (Content / Directory) receives

The HTML is plain and semantic. It keeps:
- headings `h1`–`h6`, `p`, `strong`/`em`/`u`, `br`, `hr` and `blockquote`
- lists and tables (`colspan`/`rowspan`/`align` kept)
- `img` (`src`, `alt`, `width`, `height`, `loading`) and `figure`/`figcaption`
- `iframe`: YouTube, Spotify and Podbean embeds (`src`, sizing, `allow`, `allowfullscreen`)
- `video`/`audio`/`source`
- FAQ blocks as `<details><summary>`
- inline SVG

Style it with prose/typography classes. Note:
- Content may start with its own `<h1>`, as posts do on the live site. If the page template also renders the title as `h1`, demote one of them.
- Iframes have no wrapper or positioning styles left. Give them `width:100%; aspect-ratio:16/9`.
- **Placeholders for interactive widgets:**
  - `<div data-bb-embed="lead-form"></div>`: a CF7 or Elementor lead form was here. Render the consultation/lead CTA.
  - `<div data-bb-embed="whatsapp-join"></div>`: the WhatsApp-groups join form (bbwa). Render a link to `/הצטרפו-לקבוצות-הווטסאפ/`.
  - `<a data-bb-action="lead-popup">…</a>`: this was an Elementor popup trigger. Wire it to the lead popup, or drop the attribute.

## Rules, in order

1. **Comments** removed, including the `<!-- SPOTIFY_EMBED: [episode link TBD] -->` placeholders.
2. **Hidden on live** removed: `.hide-p` (it's `display:none` in the theme), `.screen-reader-response`, `.wpcf7-response-output` and `[hidden]`.
3. **Forms:**
   - Each `<form>` is replaced by a `data-bb-embed` placeholder. For CF7, the `div.wpcf7` wrapper is replaced too.
   - Search forms are dropped.
4. **Lazy images:** `data-lazy-src`, `data-src` or `data-original` is promoted to `src` when `src` is missing or a `data:` placeholder.
5. **Dropped with their content:**
   - `script` (including JSON-LD; pages generate their own), `style`, `noscript`, `link`, `meta`, `template`, `object`, `embed`
   - form controls: `input`, `select`, `textarea`, `button`, `option`, `label`, `fieldset`, `legend`
   - `canvas`, `dialog`
6. **Attribute whitelist:**
   - **Global:** `id`, `dir`, `lang`, `title`, `aria-label`, `aria-hidden`, `role`.
   - **Per tag:** the attributes listed above.
   - `class` survives only for `align{none,left,right,center}`, `wp-caption*` and `wp-block-*`.
   - `style` is reduced to `text-align` only. This drops the Elementor/theme spacing, e.g. `margin-bottom:50px`.
   - All `data-*`, `srcset`/`sizes` and `on*` attributes are removed.
   - SVG elements keep their drawing attributes, but lose `class`, `style` and `on*`.
7. **Links:**
   - `https://(www.)bonimbayit.co.il/<path>` becomes the root-relative `/<path>`, keeping the query and fragment. The percent-encoding is left as-is, and it resolves the same way.
   - `javascript:` hrefs are removed.
   - Link *text* that shows an old absolute URL is left alone (about 26 posts).
8. **Uploaded files (images, PDFs, docs, videos):**
   - `bonimbayit.co.il/wp-content/uploads/...` in `img`/`video`/`source` `src` or `a href` is rewritten to `MEDIA_BASE_URL/<key>` once that file is in Storage (see below). This covers any file type.
   - A file that is dead on the live site too (404, or a 301 to the homepage) and has no replacement is dropped: the `<img>`/`<video>` is removed, and an `<a>` is unwrapped so its text stays.
   - Link text that is just the old upload URL (e.g. a `<video>` fallback link) is replaced by the file name.
   - `http://*.blogspot.com` is upgraded to `https://`.
   - Other external images (blogspot, googleusercontent) stay hot-linked.
9. **Iframes on our own host** (WordPress oEmbed `/embed/#?secret=`) are removed. The `<blockquote class="wp-embedded-content">` link next to each one stays.
10. **Shortcodes** from plugins that don't exist anymore are removed from text: `[read]…[/read]` (unwrapped), `[pdf id=…]`, `[gravityform …]`, `[caption]`, `[embed]`, `[contact-form-7]`, `[elementor-template]`, `[vc_*]`, `[et_pb_*]`, `[su_*]`, `[bb_track]`. Other bracketed text is kept, so real content like `[1]` isn't touched.
11. **Bare wrappers** (`div`/`section`/`span`/… with no attributes left) are unwrapped. A `div` that has its own text is kept, so its text isn't glued to the next block.
12. **Empty elements** (no text, no media descendant, no `id`) are pruned. This is repeated up to 4 times. A `p` that holds only `<br>`s also goes.

## Other loader decisions

- **Slugs:** stored percent-decoded and NFC-normalized. `pages.slug` is the full path, e.g. `strategic-partners/thank-you`.
- **SEO:**
  - `seo_title` is the Yoast title.
  - `seo_description` is the Yoast description, falling back to `og:description`.
  - `noindex` comes from the robots `index` value.
  - `seo_canonical` (new column, migration `…130400`) is the Yoast canonical as a root-relative, decoded path. Build the absolute URL with `absoluteUrl()`.
- **Tags:** these go into the new `post_tags` / `post_tag_assignments`. Tags are `noindex` on the live site.
- **Video pages:**
  - `kind='podcast'` when the page is in the "פודקאסט" category.
  - The 3 pages that 301 on the live site are loaded as `status='archived'`, keyed by `legacy_slug`. Their crawled id is the redirect target's id.
  - `video_id` links to `videos.youtube_id`. The local `videos` table is empty, so 0 are linked. Run `--only video_pages` again after the videos are loaded; 37 should link.
- **Businesses:**
  - `lead_routing='direct'` when the crawl's lead recipient isn't `info@bonimbayit.co.il` (23 businesses). Only those get `business_contacts.lead_email`.
  - `sort_order` is the live listing rank.
  - Two businesses with no primary specialty get their first specialty as primary.
  - One business (`יקיר-קבלן-מפתח`) has no regions on the live site.
- **Regions:** mapped with `public.resolve_region(label)`. All 14 crawl labels resolve, including `עכו -נהריה והסביבה` through its alias.
- **Reviews:**
  - `legacy_id = wp-comment-<id>`, `source='migrated'`, `status='approved'`.
  - The scale is converted with `x * 10 / rating_scale`. The crawl is already 0–10, so the values are unchanged.
  - Sub-scores are mapped by their Hebrew labels.
- **Products:**
  - Prices are converted to agorot.
  - Product terms and memberships come from `crawl_product_terms.py`, which reads the live `/product-category/` and `/category-product/` archive pages. Neither REST API exposes the `category_product` taxonomy. It writes `product_terms.json` (9 terms, 22 memberships). Term names come from the archive headings (e.g. "שלב רכישה"), and the `taxonomy` column is set.
  - These values equal the Commerce seed in `20260928130200_commerce_catalog.sql`, so the loader and that migration converge in either order.
  - Membership deletes are scoped to the taxonomies the loader has data for. Without `product_terms.json`, it only manages `product_cat` links and never removes stage links.
  - The loader rewrites product images to Storage. The Commerce seed still has old-host image URLs, so on a fresh DB they persist until `load.py` runs. `verify_load.py` fails while any remain.
- **Media referenced from app code** (e.g. the `/membership-tiers/` team photos and testimonial videos) is listed in `static_media.json`. It's migrated with `--only images --images static` (also included in `all`), and the app builds its URLs with `mediaUrl()` from `apps/web/lib/media.ts`.
- **Files (images and documents):**
  - Every `wp-content/uploads` file linked from content is migrated, whatever its type: images, pdf, doc(x), xls(x), zip, mp4 and so on. Downloads run at concurrency 3 with retries and are cached under `data/migration/raw/images/`. They're uploaded to the Storage bucket `media` at `uploads/YYYY/MM/<file>`, with the content type taken from the extension.
  - Storage only accepts ASCII keys, so a non-ASCII filename becomes `<sha1-10>-<ascii remnant>.<ext>`.
  - The bucket has no MIME or size restriction of its own. The local stack's global limit is 50 MiB (`supabase/config.toml`); the largest migrated file is about 2.9 MB.
  - Redirects are never followed. The live site answers a deleted upload with a 301 to the homepage, and following it used to store homepage HTML under an image or PDF key.
    - Such files are marked `gone`.
    - Cached files that turn out to be HTML are re-checked, and their bad Storage objects are deleted.
  - For a dead file, the loader looks in the WP media library (`media.json`) for a re-upload with the same name, ignoring the folder and `-N` / `-WxH` suffixes. If one exists, it's used (`replaced`); e.g. `2018/06/gant-bonimbayit.pdf` → `2023/11/gant-bonimbayit-1.pdf`.
  - `raw/images/manifest.json` maps each live URL to its key and status (`uploaded` / `replaced` / `404` / `gone` / `error`). Only `uploaded` and `replaced` entries are rewritten, and dead ones are dropped, so you can re-run the loader at any time.
  - `verify_load.py` fails if any text/json column of a content table still contains `bonimbayit.co.il/wp-content`. It also lists the files that are dead on the live site.
  - For production, set `MEDIA_BASE_URL=https://<ref>.supabase.co/storage/v1/object/public/media`, run `--only images --images all` against the prod Storage, then run `load.py` again.
