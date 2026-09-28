import 'server-only';

import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes WordPress `content_html` (posts, pages, video pages) for rendering
 * with dangerouslySetInnerHTML, and prepares it for the article layout:
 *
 *  - scripts, styles, forms (CF7 / Elementor / WhatsApp widgets) and inline
 *    SVG/canvas widgets are removed; lead forms are replaced by the page's own
 *    CTA components
 *  - JSON-LD blocks in the content (FAQPage etc.) are extracted and returned
 *    separately so the page can emit them as structured data
 *  - inline styles are dropped except text-align
 *  - the in-content <h1> becomes <h2> (the page renders its own <h1>)
 *  - h2/h3 get stable ids and are returned as a table of contents
 *  - YouTube/Spotify/Podbean iframes are lazy and wrapped in a responsive box
 *  - tables are wrapped in a horizontally scrollable box
 *  - images are lazy; lazy-load plugin placeholders (data-original) are resolved
 *  - links to the live WordPress host become root-relative, so they keep
 *    working after cutover and on staging
 */

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface PreparedHtml {
  html: string;
  toc: TocItem[];
  jsonLd: Record<string, unknown>[];
  /** The source contained a lead form that was removed. */
  hadForm: boolean;
}

const LIVE_HOSTS = new Set(['bonimbayit.co.il', 'www.bonimbayit.co.il']);

const IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'open.spotify.com',
  'www.podbean.com',
];

// JSON-LD types that the page already generates itself.
const GENERATED_LD_TYPES = new Set(['Article', 'BlogPosting', 'NewsArticle', 'BreadcrumbList', 'WebPage', 'WebSite', 'Organization', 'Person', 'ImageObject']);

const ALIGN = /^(right|left|center|justify|start|end)$/;

function rewriteHref(href: string): string {
  const trimmed = href.trim();
  try {
    const url = new URL(trimmed, 'https://bonimbayit.co.il');
    if (/^https?:$/.test(url.protocol) && LIVE_HOSTS.has(url.hostname) && /^(https?:)?\/\//i.test(trimmed)) {
      // Keep uploads (files) absolute: they are served from the old host/storage.
      if (url.pathname.startsWith('/wp-content/')) return trimmed;
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Not a URL: leave it for sanitize-html's scheme filter.
  }
  return trimmed;
}

function isExternal(href: string): boolean {
  return /^(https?:)?\/\//i.test(href);
}

function extractJsonLd(raw: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      const graph = Array.isArray(parsed['@graph']) ? (parsed['@graph'] as Record<string, unknown>[]) : [parsed];
      for (const node of graph) {
        const type = node?.['@type'];
        const types = Array.isArray(type) ? type : [type];
        if (types.some((t) => typeof t === 'string' && GENERATED_LD_TYPES.has(t))) continue;
        out.push({ '@context': 'https://schema.org', ...node });
      }
    } catch {
      // Invalid JSON in legacy content: skip it.
    }
  }
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

// Placeholders left by the migration loader (scripts/migrate/SANITIZE.md) are
// swapped for text tokens before sanitizing, then for our own trusted markup.
const TOKEN_LEAD_FORM = 'BBEMBEDLEADFORMTOKEN';
const TOKEN_WHATSAPP = 'BBEMBEDWHATSAPPTOKEN';

function consultationUrl(): string {
  const base = process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/tzuri-galili-bonimbayit/demo45min';
  return `${base}${base.includes('?') ? '&' : '?'}utm_source=website&utm_medium=post_inline&utm_campaign=consultation`;
}

/**
 * Where a migrated lead form was. ArticleBody splits the HTML here and mounts
 * the Leads workstream's <ConsultationCTA> (a React component) in its place.
 */
export const LEAD_FORM_SLOT = '<div data-bb-slot="lead-form"></div>';

const WHATSAPP_HTML =
  `<div class="bb-inline-cta bb-inline-cta-whatsapp"><p class="bb-inline-cta-title">הצטרפו לקהילת בונים בית</p>` +
  `<p>קבוצות WhatsApp אזוריות של בונים ומשפצים פרטיים בלבד.</p>` +
  `<a class="bb-inline-cta-button" href="/הצטרפו-לקבוצות-הווטסאפ/">להצטרפות לקבוצה באזורכם</a></div>`;

function replacePlaceholders(source: string): string {
  return (
    source
      .replace(/<div[^>]*data-bb-embed=["']lead-form["'][^>]*>\s*<\/div>/gi, `<p>${TOKEN_LEAD_FORM}</p>`)
      .replace(/<div[^>]*data-bb-embed=["']whatsapp-join["'][^>]*>\s*<\/div>/gi, `<p>${TOKEN_WHATSAPP}</p>`)
      // Popup triggers: data-bb-cta opens the consultation modal (LeadPopupBridge);
      // the Calendly href is the no-JS fallback.
      .replace(/<a([^>]*?)\sdata-bb-action=["']lead-popup["']([^>]*)>/gi, (_m, a: string, b: string) => {
        const attrs = `${a}${b}`.replace(/\shref=["'][^"']*["']/gi, '');
        return `<a${attrs} href="${consultationUrl()}" data-bb-cta="consultation">`;
      })
  );
}

function injectPlaceholders(html: string): string {
  return html
    .replace(new RegExp(`<p>\\s*${TOKEN_LEAD_FORM}\\s*</p>`, 'g'), LEAD_FORM_SLOT)
    .replace(new RegExp(`<p>\\s*${TOKEN_WHATSAPP}\\s*</p>`, 'g'), WHATSAPP_HTML)
    .replace(new RegExp(`${TOKEN_LEAD_FORM}|${TOKEN_WHATSAPP}`, 'g'), '');
}

export function prepareContentHtml(raw: string | null | undefined): PreparedHtml {
  const original = raw ?? '';
  const jsonLd = extractJsonLd(original);
  const hadForm = /<form[\s>]|data-bb-embed=/i.test(original);
  const source = replacePlaceholders(original);

  let html = sanitizeHtml(source, {
    allowedTags: [
      'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'pre', 'code',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup', 'small', 'span', 'a',
      'img', 'figure', 'figcaption', 'picture', 'source',
      'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'details', 'summary', 'div', 'section', 'article', 'aside',
      'iframe', 'video', 'audio',
    ],
    // Remove these elements *with* their contents.
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title', 'template'],
    exclusiveFilter: (frame) =>
      ['form', 'svg', 'canvas', 'select', 'button', 'input', 'label', 'fieldset'].includes(frame.tag) ||
      (frame.tag === 'iframe' && !frame.attribs.src),
    disallowedTagsMode: 'discard',
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'title', 'data-bb-cta'],
      img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'title', 'loading', 'decoding'],
      source: ['src', 'srcset', 'type', 'media'],
      iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy'],
      video: ['src', 'controls', 'poster', 'width', 'height', 'preload'],
      audio: ['src', 'controls', 'preload'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      col: ['span'],
      ol: ['start', 'type', 'reversed'],
      details: ['open'],
      // `id` keeps in-content anchor links (#section) working.
      '*': ['dir', 'style', 'id'],
    },
    allowedStyles: { '*': { 'text-align': [ALIGN] } },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'whatsapp'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: true,
    allowedIframeHostnames: IFRAME_HOSTS,
    transformTags: {
      h1: 'h2',
      a: (tagName, attribs) => {
        const href = attribs.href ? rewriteHref(attribs.href) : undefined;
        const out: Record<string, string> = { ...attribs };
        if (href !== undefined) out.href = href;
        if (href && isExternal(href)) {
          out.target = '_blank';
          out.rel = 'noopener noreferrer';
        } else {
          delete out.target;
          delete out.rel;
        }
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => {
        const out: Record<string, string> = { ...attribs };
        const lazySrc = attribs['data-original'] || attribs['data-src'] || attribs['data-lazy-src'];
        if (lazySrc && (!attribs.src || attribs.src.startsWith('data:'))) out.src = lazySrc;
        out.loading = 'lazy';
        out.decoding = 'async';
        if (out.alt === undefined) out.alt = '';
        return { tagName, attribs: out };
      },
      iframe: (tagName, attribs) => {
        let src = attribs.src ?? '';
        if (src.startsWith('//')) src = `https:${src}`;
        return {
          tagName,
          attribs: {
            ...attribs,
            src,
            loading: 'lazy',
            allowfullscreen: 'true',
            title: attribs.title || 'נגן מוטמע',
          },
        };
      },
    },
  });

  // Responsive embeds and scrollable tables (output is normalized by sanitize-html).
  html = html.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, (frame) => {
    const isAudio = /spotify\.com|podbean\.com/i.test(frame);
    return `<div class="${isAudio ? 'bb-embed bb-embed-audio' : 'bb-embed'}">${frame}</div>`;
  });
  html = html.replace(/<table\b/gi, '<div class="bb-table"><table').replace(/<\/table>/gi, '</table></div>');

  // Empty paragraphs left behind by removed widgets.
  html = html.replace(/<p>(\s|&nbsp;|<br \/>)*<\/p>/g, '');
  html = injectPlaceholders(html);

  // Heading anchors + table of contents.
  const toc: TocItem[] = [];
  let n = 0;
  html = html.replace(/<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g, (_all, level: string, attrs: string, inner: string) => {
    const text = stripTags(inner);
    if (!text) return `<h${level}${attrs}>${inner}</h${level}>`;
    n += 1;
    const existing = attrs.match(/\sid="([^"]+)"/);
    const id = existing ? existing[1] : `section-${n}`;
    toc.push({ id, text, level: Number(level) as 2 | 3 });
    return existing ? `<h${level}${attrs}>${inner}</h${level}>` : `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });

  // The loader strips in-content JSON-LD, so rebuild FAQPage from <details> blocks
  // (the live posts' FAQ sections carried FAQPage schema).
  if (!jsonLd.some((n) => n['@type'] === 'FAQPage')) {
    const faq = extractFaq(html);
    if (faq.length >= 2) {
      jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map((q) => ({
          '@type': 'Question',
          name: q.question,
          acceptedAnswer: { '@type': 'Answer', text: q.answer },
        })),
      });
    }
  }

  return { html, toc, jsonLd, hadForm };
}

function extractFaq(html: string): Array<{ question: string; answer: string }> {
  const out: Array<{ question: string; answer: string }> = [];
  const re = /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const question = stripTags(m[1]);
    const answer = stripTags(m[2].replace(/<\/(p|li|div)>/gi, ' '));
    if (question && answer) out.push({ question, answer });
  }
  return out;
}

/** Plain-text excerpt from HTML (for meta descriptions and cards). */
export function htmlToText(html: string | null | undefined, maxLength = 160): string {
  const text = stripTags(
    (html ?? '').replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|li|h\d|div)>/gi, ' '),
  );
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trim()}…`;
}

/** Word count, used for reading time. */
export function readingMinutes(html: string): number {
  const words = stripTags(html).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
