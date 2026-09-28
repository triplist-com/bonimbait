-- =============================================================================
-- Content (Wave 2): redirects owned by the content workstream.
--
-- * The new app's English static pages move to the live Hebrew WordPress
--   slugs (single canonical URL per page).
-- * /search-result/ (the live WordPress search results page) -> the AI search.
--
-- from_path is normalized like apps/web/lib/redirects/normalize.ts: decoded,
-- no trailing slash, lower-case. Additive and re-runnable.
-- =============================================================================

insert into public.redirects (from_path, to_path, code, is_active, source, note) values
  ('/about',         '/אודותינו/',       301, true, 'manual', 'content: English page -> live Hebrew slug'),
  ('/privacy',       '/מדיניות-פרטיות/', 301, true, 'manual', 'content: English page -> live Hebrew slug'),
  ('/terms',         '/תקנון-האתר/',     301, true, 'manual', 'content: English page -> live Hebrew slug'),
  ('/search-result', '/search/',         301, true, 'manual', 'content: WordPress search results page -> AI search')
on conflict (from_path) do update
  set to_path   = excluded.to_path,
      code      = excluded.code,
      is_active = excluded.is_active,
      note      = excluded.note
  where public.redirects.source = 'manual';
