/**
 * Content performance (/admin/insights/content/): the most viewed videos and
 * articles, the sources AI answers cite and builders open, and the leads that
 * content brought in. Pure; lib/command/content-load.ts fetches and resolves
 * titles.
 */
import type { LeadFact } from './types';

export type ContentKind = 'video' | 'post';

/** Top-level sections that are not articles (articles live at /<slug>/). */
const SECTIONS = new Set([
  'search', 'blog', 'category', 'categories', 'category-product', 'product-category', 'product', 'shop', 'cart', 'checkout',
  'business', 'recommended', 'videos', 'calculator', 'author', 'about', 'contact', 'join-us', 'membership-tiers', 'strategic-partners',
  'privacy', 'terms', 'thank-you', 'thank-you-order', 'thank-you-review', 'login', 'signup', 'account', 'platform', 'admin',
  'partner-portal', 'partner-portal-2', 'auth', 'api',
]);

/** A content page: /video/<id>/ or an article at /<slug>/. Null for everything else. */
export function classifyPath(path: string | null | undefined): { kind: ContentKind; id: string } | null {
  if (!path) return null;
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    // keep raw
  }
  const parts = p.split('?')[0].split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === 'video') return { kind: 'video', id: parts[1] };
  if (parts.length === 1 && !SECTIONS.has(parts[0])) return { kind: 'post', id: parts[0] };
  return null;
}

/** 'video:<id>' / 'post:<slug>' (answer source ids and lead attribution sources). */
export function parseContentRef(ref: string | null | undefined): { kind: ContentKind; id: string } | null {
  const m = /^(video|post):(.+)$/.exec(ref ?? '');
  return m ? { kind: m[1] as ContentKind, id: m[2] } : null;
}

export type ContentRow = {
  key: string;
  kind: ContentKind;
  id: string;
  title: string;
  href: string;
  views: number;
  visitors: number;
  citations: number;
  clicks: number;
  leads: number;
};

export type ContentTitles = ReadonlyMap<string, { title: string; href: string }>;

export const contentKey = (kind: ContentKind, id: string) => `${kind}:${id}`;

export type ContentPerformance = {
  videos: ContentRow[];
  articles: ContentRow[];
  cited: ContentRow[];
  /** Leads whose 4h last touch was a source under an AI answer. */
  leadsFromAnswers: ContentRow[];
  /** Leads by the content page their form was sent from. */
  leadsByPage: ContentRow[];
  totals: { contentViews: number; citations: number; clicks: number; attributedLeads: number };
};

function row(kind: ContentKind, id: string, titles: ContentTitles): ContentRow {
  const meta = titles.get(contentKey(kind, id));
  return {
    key: contentKey(kind, id),
    kind,
    id,
    title: meta?.title ?? (kind === 'video' ? `סרטון ${id}` : id.replace(/-/g, ' ')),
    href: meta?.href ?? (kind === 'video' ? `/video/${id}/` : `/${id}/`),
    views: 0,
    visitors: 0,
    citations: 0,
    clicks: 0,
    leads: 0,
  };
}

export function buildContentPerformance(input: {
  topPaths: ReadonlyArray<{ path: string; views: number; visitors: number }>;
  cited: ReadonlyArray<{ source_id: string; citations: number; clicks: number }>;
  leads: readonly Pick<LeadFact, 'source' | 'sourcePath' | 'status'>[];
  titles: ContentTitles;
  limit?: number;
}): ContentPerformance {
  const limit = input.limit ?? 10;
  const pages = new Map<string, ContentRow>();
  for (const p of input.topPaths) {
    const c = classifyPath(p.path);
    if (!c) continue;
    const key = contentKey(c.kind, c.id);
    const r = pages.get(key) ?? row(c.kind, c.id, input.titles);
    r.views += Number(p.views) || 0;
    r.visitors += Number(p.visitors) || 0;
    pages.set(key, r);
  }
  const cited = new Map<string, ContentRow>();
  for (const s of input.cited) {
    const c = parseContentRef(s.source_id);
    if (!c) continue;
    const key = contentKey(c.kind, c.id);
    const r = cited.get(key) ?? row(c.kind, c.id, input.titles);
    r.citations += Number(s.citations) || 0;
    r.clicks += Number(s.clicks) || 0;
    cited.set(key, r);
  }
  const fromAnswers = new Map<string, ContentRow>();
  const byPage = new Map<string, ContentRow>();
  for (const l of input.leads) {
    if (l.status === 'spam') continue;
    const ref = l.source.medium === 'ai_source' ? parseContentRef(l.source.source) : null;
    if (ref) {
      const key = contentKey(ref.kind, ref.id);
      const r = fromAnswers.get(key) ?? row(ref.kind, ref.id, input.titles);
      r.leads += 1;
      fromAnswers.set(key, r);
    }
    const page = classifyPath(l.sourcePath);
    if (page) {
      const key = contentKey(page.kind, page.id);
      const r = byPage.get(key) ?? row(page.kind, page.id, input.titles);
      r.leads += 1;
      byPage.set(key, r);
    }
  }
  const top = (m: Map<string, ContentRow>, by: (r: ContentRow) => number, kind?: ContentKind) =>
    Array.from(m.values())
      .filter((r) => !kind || r.kind === kind)
      .sort((a, b) => by(b) - by(a) || a.title.localeCompare(b.title, 'he'))
      .slice(0, limit);
  const all = Array.from(pages.values());
  return {
    videos: top(pages, (r) => r.views, 'video'),
    articles: top(pages, (r) => r.views, 'post'),
    cited: top(cited, (r) => r.citations * 10 + r.clicks),
    leadsFromAnswers: top(fromAnswers, (r) => r.leads),
    leadsByPage: top(byPage, (r) => r.leads),
    totals: {
      contentViews: all.reduce((a, r) => a + r.views, 0),
      citations: Array.from(cited.values()).reduce((a, r) => a + r.citations, 0),
      clicks: Array.from(cited.values()).reduce((a, r) => a + r.clicks, 0),
      attributedLeads: Array.from(fromAnswers.values()).reduce((a, r) => a + r.leads, 0),
    },
  };
}
