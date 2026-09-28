/**
 * Lossless bridge between stored `content_html` and the TipTap editor.
 *
 * Migrated WordPress HTML contains far more than an editor schema can
 * express (SVG icons, nav blocks, iframes, forms placeholders, divs with
 * roles, inline text directly inside <li>/<td>, ...). ProseMirror silently
 * drops or rewrites anything its schema doesn't know, so the HTML is
 * prepared before loading and restored after saving:
 *
 *  - Elements the schema can't represent become opaque "raw" atoms that
 *    carry their original outerHTML (`data-bb-raw` / `data-bb-raw-inline`).
 *    They are shown as labelled boxes in the editor and written back verbatim.
 *  - Runs of inline content that sit directly in a block container (text in
 *    a <li>, <td>, <div> or at the top level) are wrapped in a marked
 *    paragraph (`data-bb-bare`) that is unwrapped again on save, so no <p>
 *    is added around them.
 *  - Table sections (<thead>/<tfoot>) and <colgroup> are recorded on the rows
 *    and table, and rebuilt on save (TipTap flattens tables into <tbody>).
 *
 * Pure DOM code: works in the browser and in tests (happy-dom).
 */

export const RAW_BLOCK_ATTR = 'data-bb-raw';
export const RAW_INLINE_ATTR = 'data-bb-raw-inline';
export const BARE_ATTR = 'data-bb-bare';
export const SECTION_ATTR = 'data-bb-section';
export const COLGROUP_ATTR = 'data-bb-colgroup';

/** Inline elements the schema supports as marks (content must be supported too). */
const MARK_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike', 'code', 'a']);

/** Elements that are inline in HTML flow (grouped into runs inside block containers). */
const INLINE_TAGS = new Set([
  ...Array.from(MARK_TAGS),
  'span', 'br', 'img', 'sub', 'sup', 'small', 'mark', 'bdi', 'bdo', 'abbr', 'cite', 'q', 'kbd', 'var',
  'time', 'ins', 'label', 'wbr', 'font', 'big', 'tt', 'dfn', 'samp', 'data', 'output',
]);

const HEADING = /^h[1-6]$/;

function tag(el: Element): string {
  return el.tagName.toLowerCase();
}

function isWhitespaceText(node: Node): boolean {
  return node.nodeType === 3 && !/[^ \t\n\r\f]/.test(node.textContent ?? '');
}

function isInlineNode(node: Node): boolean {
  if (node.nodeType === 3) return true;
  if (node.nodeType !== 1) return false;
  return INLINE_TAGS.has(tag(node as Element));
}

/** Inline-level elements the schema can't model (kept raw). */
const INLINE_REPLACED = new Set(['svg', 'iframe', 'video', 'audio', 'canvas', 'object', 'embed', 'picture', 'input', 'button', 'select', 'textarea']);

/**
 * An inline-level unsupported element (icon, iframe, ...) sitting next to
 * text or inline elements flows with them: keep it in the same run (as a raw
 * inline atom), or spacing around it would change. Alone, it's a raw block.
 */
function isInlineReplaced(node: Node, siblings: Node[]): boolean {
  if (node.nodeType !== 1 || !INLINE_REPLACED.has(tag(node as Element))) return false;
  const i = siblings.indexOf(node);
  const neighbour = (step: 1 | -1): Node | null => {
    for (let j = i + step; j >= 0 && j < siblings.length; j += step) {
      const s = siblings[j];
      if (s.nodeType === 8 || isWhitespaceText(s)) continue;
      return s;
    }
    return null;
  };
  // Two replaced elements side by side (icons, embeds) also flow inline:
  // the whitespace between them is a visible gap.
  return [neighbour(-1), neighbour(1)].some(
    (n) => n !== null && (isInlineNode(n) || (n.nodeType === 1 && INLINE_REPLACED.has(tag(n as Element)))),
  );
}

function hasVisibleInlineContent(el: Element): boolean {
  if ((el.textContent ?? '').replace(/[ \t\n\r\f]/g, '') !== '') return true;
  return el.querySelector('img, br') !== null;
}

// ---------------------------------------------------------------------------
// Load: stored HTML -> editor HTML
// ---------------------------------------------------------------------------

function makeRawBlock(doc: Document, el: Element): Element {
  const div = doc.createElement('div');
  div.setAttribute(RAW_BLOCK_ATTR, el.outerHTML);
  return div;
}

function makeRawInline(doc: Document, el: Element): Element {
  const span = doc.createElement('span');
  span.setAttribute(RAW_INLINE_ATTR, el.outerHTML);
  return span;
}

/** Can this inline element be represented by schema marks/nodes all the way down? */
function isSupportedInline(el: Element): boolean {
  const t = tag(el);
  if (t === 'br') return true;
  if (t === 'img') return el.hasAttribute('src') && el.getAttribute('src') !== '';
  if (!MARK_TAGS.has(t)) return false;
  if (t === 'a' && !el.hasAttribute('href')) return false;
  if (/^\s*javascript:/i.test(el.getAttribute('href') ?? '')) return false;
  // Empty marks (anchors like <a id="x"></a>, icon <i>) would be dropped.
  if (!hasVisibleInlineContent(el)) return false;
  return Array.from(el.children).every((child) => isSupportedInline(child));
}

/** Prepare the children of an element whose content must be inline (p, h1-6, summary). */
function prepareInlineContainer(doc: Document, el: Element): void {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 1) {
      const c = child as Element;
      if (isSupportedInline(c)) continue;
      c.replaceWith(makeRawInline(doc, c));
    } else if (child.nodeType !== 3) {
      child.remove(); // comments
    }
  }
  // TipTap drops text nodes that are exactly "\n" (or "\n" + 2 spaces) before
  // parsing, which would glue words to neighbouring links/images/icons.
  // A single space renders the same and survives.
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const blanks: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (isWhitespaceText(n) && (n.textContent ?? '') !== ' ') blanks.push(n as Text);
  }
  blanks.forEach((t) => {
    t.textContent = ' ';
  });
}

type ContainerOpts = {
  /** The container needs at least one block (li, td, th, blockquote). */
  requiresContent?: boolean;
  /** li: the first child must be a paragraph. */
  firstMustBeParagraph?: boolean;
  /** details: keep the leading <summary> as is. */
  skipFirst?: Element;
};

function bareParagraph(doc: Document, nodes: Node[]): Element {
  const p = doc.createElement('p');
  p.setAttribute(BARE_ATTR, '');
  for (const n of nodes) p.appendChild(n);
  return p;
}

/**
 * Prepare a block container: block children are prepared recursively, runs
 * of inline content are wrapped in bare paragraphs.
 */
function prepareBlockContainer(doc: Document, el: Element, opts: ContainerOpts = {}): void {
  const children = Array.from(el.childNodes).filter((n) => n !== opts.skipFirst);
  let run: Node[] = [];
  let firstBlockSeen = false;
  let contentCount = 0;

  const flushRun = (before: Node | null) => {
    if (run.length === 0) return;
    const meaningful = run.some((n) => !isWhitespaceText(n));
    if (meaningful) {
      const p = bareParagraph(doc, run);
      prepareInlineContainer(doc, p);
      el.insertBefore(p, before);
      firstBlockSeen = true;
      contentCount += 1;
    } else {
      run.forEach((n) => n.parentNode?.removeChild(n));
    }
    run = [];
  };

  for (const child of children) {
    if (child.nodeType === 8) {
      child.parentNode?.removeChild(child);
      continue;
    }
    if (isInlineNode(child) || isInlineReplaced(child, children)) {
      run.push(child);
      continue;
    }
    flushRun(child);
    const block = child as Element;
    if (opts.firstMustBeParagraph && !firstBlockSeen && tag(block) !== 'p') {
      el.insertBefore(bareParagraph(doc, []), block);
    }
    firstBlockSeen = true;
    contentCount += 1;
    prepareBlock(doc, block);
  }
  flushRun(null);

  if (contentCount === 0 && (opts.requiresContent || opts.firstMustBeParagraph)) {
    el.appendChild(bareParagraph(doc, []));
  }
}

function prepareList(doc: Document, list: Element): void {
  const items = Array.from(list.childNodes);
  const valid = items.every((n) => isWhitespaceText(n) || n.nodeType === 8 || (n.nodeType === 1 && tag(n as Element) === 'li'));
  if (!valid) {
    list.replaceWith(makeRawBlock(doc, list));
    return;
  }
  for (const n of items) {
    if (n.nodeType !== 1) {
      n.parentNode?.removeChild(n);
      continue;
    }
    prepareBlockContainer(doc, n as Element, { firstMustBeParagraph: true });
  }
}

function prepareTable(doc: Document, table: Element): void {
  // Only plain tables are editable: sections of rows of cells.
  const sections: Element[] = [];
  let colgroup: Element | null = null;
  for (const n of Array.from(table.childNodes)) {
    if (isWhitespaceText(n) || n.nodeType === 8) continue;
    if (n.nodeType !== 1) return void table.replaceWith(makeRawBlock(doc, table));
    const t = tag(n as Element);
    if (t === 'thead' || t === 'tbody' || t === 'tfoot') sections.push(n as Element);
    else if (t === 'colgroup' && !colgroup) colgroup = n as Element;
    else return void table.replaceWith(makeRawBlock(doc, table));
  }
  for (const section of sections) {
    for (const r of Array.from(section.childNodes)) {
      if (isWhitespaceText(r) || r.nodeType === 8) continue;
      if (r.nodeType !== 1 || tag(r as Element) !== 'tr') return void table.replaceWith(makeRawBlock(doc, table));
      for (const c of Array.from(r.childNodes)) {
        if (isWhitespaceText(c) || c.nodeType === 8) continue;
        if (c.nodeType !== 1 || !['td', 'th'].includes(tag(c as Element))) {
          return void table.replaceWith(makeRawBlock(doc, table));
        }
      }
    }
  }
  if (sections.length === 0) return void table.replaceWith(makeRawBlock(doc, table));

  if (colgroup) {
    table.setAttribute(COLGROUP_ATTR, colgroup.outerHTML);
    colgroup.remove();
  }
  for (const section of sections) {
    const t = tag(section);
    section.querySelectorAll(':scope > tr').forEach((row) => {
      if (t !== 'tbody') row.setAttribute(SECTION_ATTR, t);
      row.querySelectorAll(':scope > td, :scope > th').forEach((cell) => {
        prepareBlockContainer(doc, cell, { requiresContent: true });
      });
    });
  }
}

function prepareDetails(doc: Document, details: Element): void {
  const first = Array.from(details.childNodes).find((n) => !isWhitespaceText(n) && n.nodeType !== 8);
  if (!first || first.nodeType !== 1 || tag(first as Element) !== 'summary') {
    details.replaceWith(makeRawBlock(doc, details));
    return;
  }
  const summary = first as Element;
  if (Array.from(summary.children).some((c) => !isInlineNode(c))) {
    details.replaceWith(makeRawBlock(doc, details));
    return;
  }
  prepareInlineContainer(doc, summary);
  prepareBlockContainer(doc, details, { skipFirst: summary });
}

function prepareBlock(doc: Document, el: Element): void {
  const t = tag(el);
  if (t === 'p' || HEADING.test(t)) {
    if (Array.from(el.children).some((c) => !isInlineNode(c))) {
      // Block inside a paragraph/heading (possible after the HTML parser's
      // fix-ups): keep the whole element verbatim.
      el.replaceWith(makeRawBlock(doc, el));
      return;
    }
    prepareInlineContainer(doc, el);
    return;
  }
  if (t === 'ul' || t === 'ol') return prepareList(doc, el);
  if (t === 'blockquote') return prepareBlockContainer(doc, el, { requiresContent: true });
  if (t === 'table') return prepareTable(doc, el);
  if (t === 'details') return prepareDetails(doc, el);
  if (t === 'hr') return;
  if (t === 'div' && !el.hasAttribute('data-bb-embed') && !el.hasAttribute(RAW_BLOCK_ATTR)) {
    return prepareBlockContainer(doc, el);
  }
  if (t === 'div' && el.hasAttribute(RAW_BLOCK_ATTR)) return;
  el.replaceWith(makeRawBlock(doc, el));
}

/**
 * Stored HTML -> HTML for `editor.commands.setContent()`.
 * @param doc a Document used to parse and build nodes (browser `document` or happy-dom)
 */
export function toEditorHtml(stored: string, doc: Document): string {
  const container = doc.createElement('div');
  const tpl = doc.createElement('template');
  tpl.innerHTML = stored ?? '';
  container.appendChild(tpl.content);
  prepareBlockContainer(doc, container);
  return container.innerHTML;
}

// ---------------------------------------------------------------------------
// Save: editor HTML -> stored HTML
// ---------------------------------------------------------------------------

function fragmentFrom(doc: Document, html: string): DocumentFragment {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function restoreTable(doc: Document, table: Element): void {
  const body = table.querySelector(':scope > tbody');
  const rows = Array.from(body ? body.children : table.children).filter((r) => tag(r) === 'tr');
  const groups: Array<{ section: string; rows: Element[] }> = [];
  for (const row of rows) {
    const section = row.getAttribute(SECTION_ATTR) || 'tbody';
    row.removeAttribute(SECTION_ATTR);
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.rows.push(row);
    else groups.push({ section, rows: [row] });
  }
  while (table.firstChild) table.removeChild(table.firstChild);
  const colgroup = table.getAttribute(COLGROUP_ATTR);
  if (colgroup) {
    table.removeAttribute(COLGROUP_ATTR);
    // <col> only parses inside a table context.
    const tpl = fragmentFrom(doc, `<table>${colgroup}</table>`);
    const cg = tpl.querySelector('colgroup');
    if (cg) table.appendChild(cg);
  }
  for (const group of groups) {
    const section = doc.createElement(group.section);
    group.rows.forEach((r) => section.appendChild(r));
    table.appendChild(section);
  }
}

/** Replace a placeholder with the parsed original markup. */
function restoreRaw(doc: Document, el: Element, attr: string): void {
  const html = el.getAttribute(attr) ?? '';
  let fragment = fragmentFrom(doc, html);
  // Table-only elements (<tr>, <td>, ...) need a table context to parse.
  if (!fragment.firstChild && html.trim()) {
    const tpl = fragmentFrom(doc, `<table>${html}</table>`);
    fragment = doc.createDocumentFragment();
    const inner = tpl.firstElementChild;
    if (inner) while (inner.firstChild) fragment.appendChild(inner.firstChild);
  }
  el.replaceWith(fragment);
}

/** Editor HTML (`editor.getHTML()`) -> HTML to store in `content_html`. */
export function fromEditorHtml(editorHtml: string, doc: Document): string {
  const container = doc.createElement('div');
  container.appendChild(fragmentFrom(doc, editorHtml ?? ''));

  // Tables first (their rows carry section markers), innermost last is fine:
  // each table only touches its own direct rows.
  container.querySelectorAll('table').forEach((table) => restoreTable(doc, table));
  container.querySelectorAll(`p[${BARE_ATTR}]`).forEach((p) => unwrap(p));
  // Raw content last, so markers-like attributes inside it are never touched.
  container.querySelectorAll(`[${RAW_INLINE_ATTR}]`).forEach((el) => restoreRaw(doc, el, RAW_INLINE_ATTR));
  container.querySelectorAll(`[${RAW_BLOCK_ATTR}]`).forEach((el) => restoreRaw(doc, el, RAW_BLOCK_ATTR));

  const html = container.innerHTML;
  // An empty editor holds one empty paragraph.
  return html === '<p></p>' ? '' : html;
}

// ---------------------------------------------------------------------------
// Helpers for raw atoms in the editor UI
// ---------------------------------------------------------------------------

const YOUTUBE_EMBED = /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/;

export function youtubeIdFrom(value: string): string | null {
  const m = value.match(YOUTUBE_EMBED);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(value.trim()) ? value.trim() : null;
}

export function youtubeEmbedHtml(id: string): string {
  return (
    `<iframe allowfullscreen="" frameborder="0" height="480" ` +
    `src="https://www.youtube.com/embed/${id}" title="YouTube video" width="100%"></iframe>`
  );
}

/** Placeholders understood by lib/content/sanitize.ts. */
export const EMBED_PLACEHOLDERS = {
  'lead-form': 'טופס השארת פרטים (ייעוץ)',
  'whatsapp-join': 'הצטרפות לקבוצות WhatsApp',
} as const;

export type EmbedPlaceholder = keyof typeof EMBED_PLACEHOLDERS;

export function embedPlaceholderHtml(kind: EmbedPlaceholder): string {
  return `<div data-bb-embed="${kind}"></div>`;
}

/** Short Hebrew label for a raw atom, shown in the editor. */
export function describeRawHtml(html: string): string {
  const embed = html.match(/data-bb-embed=["']([^"']+)["']/);
  if (embed && embed[1] in EMBED_PLACEHOLDERS) return EMBED_PLACEHOLDERS[embed[1] as EmbedPlaceholder];
  const yt = youtubeIdFrom(html);
  if (/^<iframe/i.test(html) && yt) return `סרטון YouTube (${yt})`;
  if (/^<iframe/i.test(html)) return 'תוכן מוטמע (iframe)';
  if (/data-bb-action=["']lead-popup/.test(html)) return 'כפתור פתיחת טופס ייעוץ';
  const t = html.match(/^<([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase() ?? 'html';
  const names: Record<string, string> = {
    svg: 'אייקון (SVG)',
    table: 'טבלה מורכבת',
    figure: 'תמונה עם כיתוב',
    nav: 'תפריט ניווט',
    section: 'מקטע HTML',
    pre: 'קוד',
    video: 'וידאו',
    audio: 'שמע',
    form: 'טופס',
  };
  return names[t] ?? `HTML מקורי (<${t}>)`;
}
