import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, adminNavFor } from '@/lib/admin/nav';
import { buildContentPerformance, classifyPath, parseContentRef } from '@/lib/command/content';
import { buildDigest, escapeHtml } from '@/lib/command/digest';
import { demoCommandCenter, demoInsights } from '@/lib/command/demo';
import { parseExpectedValueInput, sameAsDefault } from '@/lib/command/pipeline';
import type { LeadFact } from '@/lib/command/types';

const hrefs = (role: 'admin' | 'editor', flags: boolean) =>
  adminNavFor(role, () => flags).flatMap((g) => g.items.map((i) => i.href));

describe('admin nav (command)', () => {
  it('keeps the Command Center screens dark until FLAG_COMMAND_CENTER', () => {
    expect(hrefs('admin', false)).not.toContain('/admin/insights/');
    expect(hrefs('admin', true)).toEqual(expect.arrayContaining(['/admin/insights/', '/admin/insights/leads/', '/admin/insights/content/', '/admin/digest/', '/admin/insights/pipeline/']));
    expect(ADMIN_NAV[0].items[0]).toMatchObject({ href: '/admin/', label: 'חדר הבקרה' });
  });

  it('shows the rebuilt search stats to admins without the flag, and the pipeline editor only to admins', () => {
    expect(hrefs('admin', false)).toContain('/admin/search-stats/');
    expect(hrefs('editor', true)).not.toContain('/admin/search-stats/');
    expect(hrefs('editor', true)).not.toContain('/admin/insights/pipeline/');
    expect(hrefs('editor', true)).toContain('/admin/insights/');
  });
});

describe('expected-value editor input', () => {
  it('parses shekels and percent, rejecting nonsense', () => {
    expect(parseExpectedValueInput({ deal: '6,900', rate: '35' })).toEqual({ ok: true, dealValueAgorot: 690_000, closeRate: 0.35 });
    expect(parseExpectedValueInput({ deal: '₪ 141000', rate: '12.5%' })).toEqual({ ok: true, dealValueAgorot: 14_100_000, closeRate: 0.125 });
    expect(parseExpectedValueInput({ deal: '', rate: '10' }).ok).toBe(false);
    expect(parseExpectedValueInput({ deal: '-1', rate: '10' }).ok).toBe(false);
    expect(parseExpectedValueInput({ deal: '100', rate: '101' }).ok).toBe(false);
    expect(parseExpectedValueInput({ deal: '99999999', rate: '1' }).ok).toBe(false);
    expect(sameAsDefault({ dealValueAgorot: 690_000, closeRate: 0.35 }, { dealValueAgorot: 690_000, closeRate: 0.35 })).toBe(true);
    expect(sameAsDefault({ dealValueAgorot: 690_000, closeRate: 0.35 }, { dealValueAgorot: 690_000, closeRate: 0.4 })).toBe(false);
  });
});

describe('content performance', () => {
  it('classifies content paths and refs', () => {
    expect(classifyPath('/video/5RNVyFYpkCw/')).toEqual({ kind: 'video', id: '5RNVyFYpkCw' });
    expect(classifyPath('/%D7%A8%D7%A6%D7%A4%D7%94/')).toEqual({ kind: 'post', id: 'רצפה' });
    expect(classifyPath('/search/')).toBeNull();
    expect(classifyPath('/business/abc/')).toBeNull();
    expect(classifyPath('/')).toBeNull();
    expect(parseContentRef('post:hetel')).toEqual({ kind: 'post', id: 'hetel' });
    expect(parseContentRef('podcast:1')).toBeNull();
  });

  it('ranks views, citations and the leads content brought in', () => {
    const lead = (over: Partial<LeadFact>) => ({ status: 'new' as const, source: { medium: 'direct' as const, source: null, campaign: null, label: '' }, sourcePath: null, ...over });
    const perf = buildContentPerformance({
      topPaths: [
        { path: '/video/a/', views: 10, visitors: 8 },
        { path: '/hetel/', views: 30, visitors: 20 },
        { path: '/video/b/', views: 40, visitors: 30 },
        { path: '/search/', views: 999, visitors: 9 },
      ],
      cited: [
        { source_id: 'video:a', citations: 5, clicks: 2 },
        { source_id: 'post:hetel', citations: 7, clicks: 0 },
        { source_id: 'junk', citations: 99, clicks: 0 },
      ],
      leads: [
        lead({ source: { medium: 'ai_source', source: 'video:a', campaign: null, label: '' } }),
        lead({ source: { medium: 'ai_source', source: 'video:a', campaign: null, label: '' }, status: 'spam' }),
        lead({ sourcePath: '/hetel/' }),
      ],
      titles: new Map([['post:hetel', { title: 'היטל השבחה', href: '/hetel/' }]]),
    });
    expect(perf.videos.map((r) => [r.id, r.views])).toEqual([['b', 40], ['a', 10]]);
    expect(perf.articles[0]).toMatchObject({ title: 'היטל השבחה', views: 30 });
    expect(perf.cited.map((r) => r.key)).toEqual(['post:hetel', 'video:a']);
    expect(perf.leadsFromAnswers).toEqual([expect.objectContaining({ key: 'video:a', leads: 1 })]);
    expect(perf.leadsByPage).toEqual([expect.objectContaining({ key: 'post:hetel', leads: 1 })]);
    expect(perf.totals).toEqual({ contentViews: 80, citations: 12, clicks: 2, attributedLeads: 1 });
  });
});

describe('weekly digest', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe('&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
  });

  it('renders the week without contact details or scripts', () => {
    const data = demoCommandCenter(7);
    const digest = buildDigest(data, demoInsights().topics, { siteUrl: 'https://bonimbait.com/', weekLabel: '8 באוקטובר עד 15 באוקטובר', isDemo: true });
    expect(digest.subject).toMatch(/^השבוע בבונים בית: [\d,]+ לידים/);
    expect(digest.preheader).toContain('רצפה צפה');
    expect(digest.html).toContain('https://bonimbait.com/admin/');
    expect(digest.html).toContain(data.hotLeads[0].ref);
    expect(digest.html).toContain('מרתף במגרש משופע');
    expect(digest.html).not.toMatch(/<script|@example\.com|05\d-/);
    expect(digest.html).toContain('dir="rtl"');
  });

  it('escapes builder text that reaches the e-mail', () => {
    const data = demoCommandCenter(7);
    const topics = [{ ...demoInsights().topics.find((t) => t.level === 'gap')!, label: '<img src=x onerror=alert(1)>', suggestedTitle: null }];
    const { html } = buildDigest(data, topics, { siteUrl: 'https://x.test', weekLabel: 'w' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
