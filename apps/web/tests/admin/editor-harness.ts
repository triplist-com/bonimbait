/**
 * Round-trip harness for the admin editor (needs a DOM: run under happy-dom).
 *
 * `roundTrip()` does exactly what the browser editor does on load + save.
 * `canonical()` is an independent rendering-equivalence normal form used to
 * compare the stored HTML with the saved HTML: attribute order, whitespace
 * collapsing, mark nesting order and b/strong-style synonyms don't count;
 * any lost or added element, attribute or text does.
 */
import { Editor } from '@tiptap/core';
import { buildExtensions } from '@/lib/admin/editor/extensions';
import { fromEditorHtml, toEditorHtml } from '@/lib/admin/editor/codec';

export function roundTrip(stored: string): string {
  // A fresh editor per document: a shared one keeps every document in its undo history.
  const editor = new Editor({ extensions: buildExtensions(), content: '' });
  try {
    editor.commands.setContent(toEditorHtml(stored, document));
    return fromEditorHtml(editor.getHTML(), document);
  } finally {
    editor.destroy();
  }
}

const MARKS: Record<string, string> = {
  strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', s: 's', del: 's', strike: 's', code: 'code', a: 'a',
};
const INLINE = new Set([
  ...Object.keys(MARKS),
  'span', 'br', 'img', 'sub', 'sup', 'small', 'mark', 'bdi', 'bdo', 'abbr', 'cite', 'q', 'kbd', 'var',
  'time', 'ins', 'label', 'wbr', 'font', 'big', 'tt', 'dfn', 'samp', 'data', 'output', 'svg', 'iframe',
]);
const BOOLEAN_ATTRS = new Set(['allowfullscreen', 'open', 'controls', 'hidden', 'disabled', 'checked']);

function attrs(el: Element): string {
  const list = Array.from(el.attributes).map((a) => {
    const name = a.name.toLowerCase();
    let value = a.value;
    if (BOOLEAN_ATTRS.has(name)) value = '';
    // Defaults that render identically.
    if (name === 'start' && value === '1' && el.tagName.toLowerCase() === 'ol') return '';
    if ((name === 'colspan' || name === 'rowspan') && value === '1') return '';
    if (name === 'style') {
      value = value
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const i = d.indexOf(':');
          return i < 0 ? d : `${d.slice(0, i).trim().toLowerCase()}: ${d.slice(i + 1).trim()}`;
        })
        .sort()
        .join('; ');
    }
    return `${name}="${value}"`;
  }).filter(Boolean);
  list.sort();
  return list.length ? ` ${list.join(' ')}` : '';
}

type Token = { kind: 'text' | 'atom'; value: string; marks: string };

function hasContent(el: Element): boolean {
  return (el.textContent ?? '') !== '' || el.querySelector('img,br,svg,iframe,span') !== null;
}

/** Marks that don't show on a bare space. */
const INVISIBLE_ON_SPACE = new Set(['strong', 'em', 'code']);

function markSet(marks: string[], text?: string): string {
  let list = Array.from(new Set(marks));
  if (text !== undefined && !/[^ \t\n\r\f]/.test(text)) {
    list = list.filter((m) => !INVISIBLE_ON_SPACE.has(m.split(' ')[0]));
  }
  return list.sort().join(',');
}

function walkInline(node: Node, marks: string[], out: Token[]): void {
  if (node.nodeType === 3) {
    const value = node.textContent ?? '';
    out.push({ kind: 'text', value, marks: markSet(marks, value) });
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const t = el.tagName.toLowerCase();
  if (t in MARKS && hasContent(el) && !(t === 'a' && !el.hasAttribute('href'))) {
    const key = `${MARKS[t]}${attrs(el)}`;
    el.childNodes.forEach((c) => walkInline(c, [...marks, key], out));
    return;
  }
  out.push({ kind: 'atom', value: canonElement(el), marks: markSet(marks) });
}

function canonRun(nodes: Node[]): string {
  const raw: Token[] = [];
  nodes.forEach((n) => walkInline(n, [], raw));
  // Collapse whitespace and merge adjacent text with the same marks.
  const tokens: Token[] = [];
  for (const tok of raw) {
    if (tok.kind === 'text') {
      const value = tok.value.replace(/[ \t\n\r\f]+/g, ' ');
      const prev = tokens[tokens.length - 1];
      if (prev && prev.kind === 'text' && prev.marks === tok.marks) prev.value += value;
      else tokens.push({ ...tok, value });
    } else tokens.push(tok);
  }
  // Collapse spaces across token boundaries; trim at run edges and around <br>.
  let lastEndsSpace = true;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === 'atom') {
      if (tok.value.startsWith('<br')) {
        for (let j = i - 1; j >= 0 && tokens[j].kind === 'text'; j--) {
          tokens[j].value = tokens[j].value.replace(/ +$/, '');
          if (tokens[j].value) break;
        }
        lastEndsSpace = true;
      } else lastEndsSpace = false;
      continue;
    }
    if (lastEndsSpace) tok.value = tok.value.replace(/^ +/, '');
    if (tok.value) lastEndsSpace = tok.value.endsWith(' ');
  }
  for (let j = tokens.length - 1; j >= 0 && tokens[j].kind === 'text'; j--) {
    tokens[j].value = tokens[j].value.replace(/ +$/, '');
    if (tokens[j].value) break;
  }
  const kept = tokens.filter((t) => t.kind === 'atom' || t.value !== '');
  // Re-merge texts that became adjacent.
  const merged: Token[] = [];
  for (const t of kept) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === 'text' && t.kind === 'text' && prev.marks === t.marks) prev.value += t.value;
    else merged.push({ ...t });
  }
  if (merged.length === 0) return '';
  return `{${merged.map((t) => `[${t.marks}]${t.kind === 'text' ? JSON.stringify(t.value) : t.value}`).join('')}}`;
}

function canonChildren(parent: Node): string {
  let out = '';
  let run: Node[] = [];
  const flush = () => {
    out += canonRun(run);
    run = [];
  };
  parent.childNodes.forEach((child) => {
    if (child.nodeType === 8) return;
    if (child.nodeType === 3 || (child.nodeType === 1 && INLINE.has((child as Element).tagName.toLowerCase()))) {
      run.push(child);
      return;
    }
    flush();
    if (child.nodeType === 1) out += canonElement(child as Element);
  });
  flush();
  return out;
}

function canonElement(el: Element): string {
  const t = el.tagName.toLowerCase();
  const inner = t === 'template' ? '' : canonChildren(el);
  return `<${t}${attrs(el)}>${inner}</${t}>`;
}

export function canonical(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return canonChildren(tpl.content);
}

/** First differing position, with context, for readable failures. */
export function firstDiff(a: string, b: string, context = 120): string | null {
  if (a === b) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at ${i}:\n  stored: …${a.slice(Math.max(0, i - context), i + context)}…\n  saved:  …${b.slice(Math.max(0, i - context), i + context)}…`;
}
