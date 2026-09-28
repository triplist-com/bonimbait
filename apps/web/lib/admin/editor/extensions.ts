/**
 * TipTap schema for the admin rich-text editor. Shared by the React editor
 * and the round-trip tests, so what the tests prove is what editors get.
 *
 * Every node and mark keeps the HTML attributes it doesn't model itself in
 * `htmlAttrs` (dir, style, class, id, role, aria-*, width/height, ...), so
 * loading and saving migrated content does not drop them. See codec.ts for
 * the placeholders (raw atoms, bare paragraphs, table sections).
 */
import { Extension, Node, mergeAttributes, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BARE_ATTR, RAW_BLOCK_ATTR, RAW_INLINE_ATTR, SECTION_ATTR, COLGROUP_ATTR, describeRawHtml } from './codec';

type Attrs = Record<string, string>;

const INTERNAL_ATTRS = new Set([BARE_ATTR, RAW_BLOCK_ATTR, RAW_INLINE_ATTR, SECTION_ATTR, COLGROUP_ATTR]);

function collectAttrs(el: HTMLElement, exclude: string[]): Attrs | null {
  const out: Attrs = {};
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (exclude.includes(name) || INTERNAL_ATTRS.has(name)) continue;
    out[attr.name] = attr.value;
  }
  return Object.keys(out).length ? out : null;
}

/** Attributes each type models itself (never duplicated into htmlAttrs). */
const HANDLED: Record<string, string[]> = {
  paragraph: [],
  heading: [],
  bulletList: [],
  orderedList: ['start', 'type'],
  listItem: [],
  blockquote: [],
  horizontalRule: [],
  hardBreak: [],
  table: [],
  tableRow: [],
  tableCell: ['colspan', 'rowspan', 'colwidth'],
  tableHeader: ['colspan', 'rowspan', 'colwidth'],
  image: ['src'],
  div: [],
  details: [],
  detailsSummary: [],
  bold: [],
  italic: [],
  strike: [],
  underline: [],
  code: [],
  link: ['href', 'target', 'rel', 'class', 'title'],
};

const PreserveAttributes = Extension.create({
  name: 'preserveAttributes',
  addGlobalAttributes() {
    return Object.entries(HANDLED).map(([type, exclude]) => ({
      types: [type],
      attributes: {
        htmlAttrs: {
          default: null,
          keepOnSplit: type !== 'heading',
          parseHTML: (el: HTMLElement) => collectAttrs(el, exclude),
          renderHTML: (attrs: Record<string, unknown>) => (attrs.htmlAttrs as Attrs | null) ?? {},
        },
      },
    }));
  },
});

/** Bare paragraph marker (inline run unwrapped on save) and table row sections. */
const StructureMarkers = Extension.create({
  name: 'structureMarkers',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          bare: {
            default: false,
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => el.hasAttribute(BARE_ATTR),
            renderHTML: (attrs: Record<string, unknown>) => (attrs.bare ? { [BARE_ATTR]: '' } : {}),
          },
        },
      },
      {
        types: ['tableRow'],
        attributes: {
          section: {
            default: null,
            keepOnSplit: true,
            parseHTML: (el: HTMLElement) => el.getAttribute(SECTION_ATTR),
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.section ? { [SECTION_ATTR]: attrs.section as string } : {},
          },
        },
      },
      {
        types: ['table'],
        attributes: {
          colgroup: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute(COLGROUP_ATTR),
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.colgroup ? { [COLGROUP_ATTR]: attrs.colgroup as string } : {},
          },
        },
      },
    ];
  },
});

/** Remember the source tag (b vs strong, i vs em, del vs s) so saving doesn't rename it. */
function withSourceTag<T extends typeof Bold | typeof Italic | typeof Strike>(mark: T, fallback: string, tags: string[]) {
  return (mark as typeof Bold).extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        tag: {
          default: null,
          parseHTML: (el: HTMLElement) => {
            const t = typeof el === 'string' ? null : el.tagName?.toLowerCase();
            return t && tags.includes(t) && t !== fallback ? t : null;
          },
          renderHTML: () => ({}),
        },
      };
    },
    renderHTML({ mark, HTMLAttributes }) {
      return [(mark.attrs.tag as string | null) || fallback, HTMLAttributes, 0];
    },
  });
}

const Image = Node.create({
  name: 'image',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', HTMLAttributes];
  },
});

/** Generic <div> container (WordPress wrappers, centered blocks, ...). */
const Div = Node.create({
  name: 'div',
  group: 'block',
  content: 'block*',
  defining: true,
  parseHTML() {
    return [{ tag: 'div' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes, 0];
  },
});

/** FAQ block: <details><summary>question</summary>answer…</details>. */
const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary block*',
  defining: true,
  parseHTML() {
    return [{ tag: 'details' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['details', HTMLAttributes, 0];
  },
  // In the editor, show the block always expanded (a real <details> would
  // hide the answer and toggle on every click into the question).
  addNodeView() {
    if (typeof document === 'undefined') return null;
    return () => {
      const dom = document.createElement('div');
      dom.className = 'bb-details';
      dom.setAttribute('data-label', 'שאלה ותשובה (FAQ)');
      return { dom, contentDOM: dom };
    };
  },
});

const DetailsSummary = Node.create({
  name: 'detailsSummary',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'summary' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['summary', HTMLAttributes, 0];
  },
  addNodeView() {
    if (typeof document === 'undefined') return null;
    return () => {
      const dom = document.createElement('div');
      dom.className = 'bb-summary';
      return { dom, contentDOM: dom };
    };
  },
});

function rawNodeView(inline: boolean) {
  return ({ node }: { node: { attrs: Record<string, unknown> } }) => {
    const dom = document.createElement(inline ? 'span' : 'div');
    const html = String(node.attrs.html ?? '');
    dom.className = inline ? 'bb-raw bb-raw-inline' : 'bb-raw bb-raw-block';
    dom.contentEditable = 'false';
    dom.setAttribute('data-raw-label', describeRawHtml(html));
    dom.title = html.length > 300 ? `${html.slice(0, 300)}…` : html;
    const yt = html.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/);
    if (!inline && /^<iframe/i.test(html) && yt) {
      const img = document.createElement('img');
      img.src = `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
      img.alt = '';
      img.className = 'bb-raw-thumb';
      dom.appendChild(img);
    }
    const label = document.createElement('span');
    label.className = 'bb-raw-label';
    label.textContent = describeRawHtml(html);
    dom.appendChild(label);
    return { dom };
  };
}

/** Block HTML the schema can't express, kept verbatim. Editable via the HTML dialog. */
const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  priority: 1000,
  addAttributes() {
    return {
      html: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute(RAW_BLOCK_ATTR) ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ [RAW_BLOCK_ATTR]: attrs.html as string }),
      },
    };
  },
  parseHTML() {
    return [{ tag: `div[${RAW_BLOCK_ATTR}]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes];
  },
  addNodeView() {
    return typeof document === 'undefined' ? null : (rawNodeView(false) as never);
  },
});

const RawInline = Node.create({
  name: 'rawInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  priority: 1000,
  addAttributes() {
    return {
      html: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute(RAW_INLINE_ATTR) ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ [RAW_INLINE_ATTR]: attrs.html as string }),
      },
    };
  },
  parseHTML() {
    return [{ tag: `span[${RAW_INLINE_ATTR}]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes];
  },
  addNodeView() {
    return typeof document === 'undefined' ? null : (rawNodeView(true) as never);
  },
});

/** No <colgroup>/min-width styles in the saved HTML (TipTap adds them by default). */
const PlainTable = Table.extend({
  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ['tbody', 0]];
  },
});

/** colspan/rowspan, written only when they span (prosemirror-tables sets 1 explicitly). */
function spanAttribute(name: 'colspan' | 'rowspan') {
  return {
    default: 1,
    parseHTML: (el: HTMLElement) => {
      const v = parseInt(el.getAttribute(name) ?? '1', 10);
      return Number.isFinite(v) && v > 0 ? v : 1;
    },
    renderHTML: (attrs: Record<string, unknown>) => (Number(attrs[name]) > 1 ? { [name]: attrs[name] } : {}),
  };
}

/** Cells: alignment stays in the preserved `style`/`align` attributes. */
function plainCell<T extends typeof TableCell | typeof TableHeader>(cell: T) {
  return (cell as typeof TableCell).extend({
    addAttributes() {
      return {
        colspan: spanAttribute('colspan'),
        rowspan: spanAttribute('rowspan'),
        colwidth: {
          default: null,
          parseHTML: (el: HTMLElement) => {
            const v = el.getAttribute('colwidth');
            return v ? v.split(',').map((w) => parseInt(w, 10)) : null;
          },
        },
      };
    },
  });
}

/** Safe-link check: everything except script URLs (migrated content uses tel:, whatsapp:, #anchors). */
export function isAllowedHref(url: string): boolean {
  return !/^\s*(javascript|vbscript|data):/i.test(url ?? '');
}

export function buildExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      bold: false,
      italic: false,
      strike: false,
      codeBlock: false,
      trailingNode: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        HTMLAttributes: { target: null, rel: null, class: null },
        isAllowedUri: (url: string) => isAllowedHref(url),
      },
    }),
    withSourceTag(Bold, 'strong', ['strong', 'b']),
    withSourceTag(Italic, 'em', ['em', 'i']),
    withSourceTag(Strike, 's', ['s', 'del', 'strike']),
    Image,
    Div,
    Details,
    DetailsSummary,
    RawBlock,
    RawInline,
    PlainTable.configure({ resizable: false }),
    TableRow,
    plainCell(TableHeader),
    plainCell(TableCell),
    PreserveAttributes,
    StructureMarkers,
  ];
}


