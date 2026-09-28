// @vitest-environment happy-dom
/**
 * The admin editor must load and save migrated content without mangling it.
 * Fixtures are real posts from the migrated DB (tables with <thead>, YouTube
 * iframes, FAQ <details>, SVG icons, lead-popup links, colspans) plus a
 * synthetic file with the data-bb-embed placeholders and other edge cases.
 * The whole corpus can be checked with editor-roundtrip-corpus.test.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '@/lib/admin/editor/extensions';
import { fromEditorHtml, toEditorHtml, describeRawHtml, youtubeIdFrom } from '@/lib/admin/editor/codec';
import { canonical, firstDiff, roundTrip } from './editor-harness';

const dir = join(__dirname, 'fixtures');
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.html'));

function count(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

describe('editor round-trip (fixtures)', () => {
  it.each(fixtures)('%s survives load + save', (file) => {
    const stored = readFileSync(join(dir, file), 'utf8');
    const saved = roundTrip(stored);
    expect(firstDiff(canonical(stored), canonical(saved))).toBeNull();
    // Saving again changes nothing.
    expect(roundTrip(saved)).toBe(saved);
    // Spot checks on the structures the brief calls out.
    for (const re of [/<details/g, /<summary/g, /<iframe/g, /<table/g, /<thead/g, /<tfoot/g, /data-bb-embed=/g, /data-bb-action=/g, /<svg/g]) {
      expect(count(saved, re)).toBe(count(stored, re));
    }
    // No editor-internal markers leak into stored HTML.
    expect(saved).not.toMatch(/data-bb-(raw|bare|section|colgroup)/);
  });

  it('keeps edits and untouched content together', () => {
    const stored = readFileSync(join(dir, 'synthetic-edge-cases.html'), 'utf8');
    const editor = new Editor({ extensions: buildExtensions(), content: '' });
    editor.commands.setContent(toEditorHtml(stored, document));
    editor.commands.insertContentAt(editor.state.doc.content.size, '<p>פסקה חדשה</p>');
    const saved = fromEditorHtml(editor.getHTML(), document);
    editor.destroy();
    expect(canonical(saved)).toBe(canonical(`${stored}<p>פסקה חדשה</p>`));
  });

  it('writes an empty document as an empty string', () => {
    expect(roundTrip('')).toBe('');
  });

  it('never keeps javascript: links as links', () => {
    const saved = roundTrip('<p><a href="javascript:alert(1)">x</a></p>');
    // Kept verbatim as raw HTML (the public renderer sanitizes it), never as an editable link.
    expect(canonical(saved)).toBe(canonical('<p><a href="javascript:alert(1)">x</a></p>'));
  });
});

describe('raw block labels', () => {
  it('describes placeholders and embeds in Hebrew', () => {
    expect(describeRawHtml('<div data-bb-embed="lead-form"></div>')).toContain('טופס');
    expect(describeRawHtml('<iframe src="https://www.youtube.com/embed/MZa9dyWqZnk"></iframe>')).toContain('MZa9dyWqZnk');
    expect(youtubeIdFrom('https://www.youtube.com/watch?v=MZa9dyWqZnk')).toBe('MZa9dyWqZnk');
    expect(youtubeIdFrom('https://youtu.be/MZa9dyWqZnk')).toBe('MZa9dyWqZnk');
    expect(youtubeIdFrom('not a video')).toBeNull();
  });
});
