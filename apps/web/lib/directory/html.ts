/**
 * HTML helpers for business descriptions.
 *
 * `businesses.description_html` comes from two sources: the WordPress import
 * (trusted-ish) and business owners, who can write the column directly through
 * PostgREST under RLS. So it is always sanitized before rendering: an
 * allowlist of formatting tags, no attributes except a safe href on <a>.
 *
 * Safe for server and client.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span',
]);
const VOID_TAGS = new Set(['br']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

function escapeText(text: string): string {
  // Text between tags is already entity-encoded HTML; only neutralize stray
  // angle brackets so no new markup can form.
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeHref(attrs: string): string | null {
  const match = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const raw = (match?.[2] ?? match?.[3] ?? match?.[4] ?? '').trim();
  if (!raw) return null;
  const decoded = raw.replace(/&amp;/g, '&');
  if (!/^(https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(decoded)) return null;
  return decoded.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
}

/** Allowlist sanitizer. Output contains only ALLOWED_TAGS without attributes (plus a[href]). */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  const html = input.replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, '');
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
  let out = '';
  let last = 0;
  const open: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    out += escapeText(html.slice(last, m.index));
    last = tagRe.lastIndex;
    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (closing) {
      const idx = open.lastIndexOf(tag);
      if (idx === -1) continue;
      // Close anything left open inside it, then the tag itself.
      while (open.length > idx) out += `</${open.pop()}>`;
      continue;
    }
    if (VOID_TAGS.has(tag)) {
      out += `<${tag}>`;
      continue;
    }
    if (tag === 'a') {
      const href = safeHref(m[2]);
      out += href ? `<a href="${href}" rel="nofollow noopener" target="_blank">` : '<a>';
    } else {
      out += `<${tag}>`;
    }
    open.push(tag);
  }
  out += escapeText(html.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', hellip: '…' };

/** Plain text from HTML (for excerpts, meta descriptions, search). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(DROP_WITH_CONTENT, ' ')
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (all, name: string) => {
      if (ENTITIES[name]) return ENTITIES[name];
      if (name.startsWith('#')) {
        const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : all;
      }
      return all;
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Owner-edited plain text -> HTML. Blank lines separate paragraphs; lines
 * starting with "-" or "•" become a bulleted list.
 */
export function textToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.every((l) => /^[-•*]\s*/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
    })
    .join('\n');
}

/** HTML -> editable plain text (inverse of textToHtml, lossy for other markup). */
export function htmlToEditableText(html: string | null | undefined): string {
  if (!html) return '';
  const withBullets = html.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/(p|ul|ol|h[1-6])>/gi, '\n\n');
  return htmlToText(withBullets)
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** JSON for a <script type="application/ld+json"> tag, safe against </script> injection. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
