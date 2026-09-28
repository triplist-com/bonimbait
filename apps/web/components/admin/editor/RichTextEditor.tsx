'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { buildExtensions, isAllowedHref } from '@/lib/admin/editor/extensions';
import {
  EMBED_PLACEHOLDERS,
  embedPlaceholderHtml,
  fromEditorHtml,
  toEditorHtml,
  youtubeEmbedHtml,
  youtubeIdFrom,
  type EmbedPlaceholder,
} from '@/lib/admin/editor/codec';
import MediaPicker from '../media/MediaPicker';
import './editor.css';

type Align = 'right' | 'center' | 'left' | 'justify';

/** Set/clear text-align on the selected paragraphs and headings (kept in htmlAttrs.style). */
function setAlign(editor: Editor, align: Align | null) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true;
        const attrs = { ...((node.attrs.htmlAttrs as Record<string, string> | null) ?? {}) };
        const rest = (attrs.style ?? '')
          .split(';')
          .map((d) => d.trim())
          .filter((d) => d && !/^text-align\s*:/i.test(d));
        if (align) rest.unshift(`text-align: ${align}`);
        if (rest.length) attrs.style = rest.join('; ');
        else delete attrs.style;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, htmlAttrs: Object.keys(attrs).length ? attrs : null });
        return false;
      });
      return true;
    })
    .run();
}

function currentAlign(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const style = ((node.attrs.htmlAttrs as Record<string, string> | null) ?? {}).style ?? '';
      return style.match(/text-align\s*:\s*([a-z]+)/i)?.[1] ?? null;
    }
  }
  return null;
}

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-[2rem] rounded-md px-2 py-1 text-sm leading-5 transition disabled:opacity-40 ${
        active ? 'bg-primary-100 text-primary-800' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-gray-200" />;
}

/**
 * Rich-text editor for posts, pages, video pages, businesses and products.
 * Loads and saves `content_html` through lib/admin/editor/codec.ts, which
 * keeps anything the editor can't model (SVG, embeds, custom blocks) intact.
 * The stored HTML is kept in a hidden input named `name`.
 */
export default function RichTextEditor({
  name,
  defaultValue,
  minHeight = 420,
  label = 'תוכן',
}: {
  name: string;
  defaultValue: string;
  minHeight?: number;
  label?: string;
}) {
  // Controlled: for type="hidden", React re-applies defaultValue on every
  // render, which would clobber a value written through a ref.
  const [stored, setStored] = useState(defaultValue ?? '');
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [source, setSource] = useState(defaultValue ?? '');
  const [picker, setPicker] = useState(false);
  const extensions = useMemo(() => buildExtensions(), []);

  const sync = (editor: Editor) => {
    const html = fromEditorHtml(editor.getHTML(), document);
    setStored(html);
    return html;
  };

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    // Initial content (not setContent in onCreate): loading must not be undoable.
    content: typeof document === 'undefined' ? '' : toEditorHtml(defaultValue ?? '', document),
    editorProps: {
      attributes: {
        dir: 'rtl',
        class: 'bb-editor prose-admin focus:outline-none',
        style: `min-height:${minHeight}px`,
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: e }) => {
      sync(e);
    },
  });

  // Re-rendered on every transaction (shouldRerenderOnTransaction), so the
  // toolbar state is simply derived here.
  const state = ((e: Editor | null) =>
      e
        ? {
            block: e.isActive('heading', { level: 2 })
              ? 'h2'
              : e.isActive('heading', { level: 3 })
                ? 'h3'
                : e.isActive('heading', { level: 4 })
                  ? 'h4'
                  : 'p',
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            link: e.isActive('link'),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            table: e.isActive('table'),
            raw: e.isActive('rawBlock') || e.isActive('rawInline'),
            image: e.isActive('image'),
            align: currentAlign(e),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null)(editor);


  function switchMode(next: 'visual' | 'html') {
    if (!editor || next === mode) return;
    if (next === 'html') {
      setSource(sync(editor));
    } else {
      editor.commands.setContent(toEditorHtml(source, document));
      sync(editor);
    }
    setMode(next);
  }

  function editLink() {
    if (!editor) return;
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('כתובת הקישור (השאירו ריק להסרה):', prev);
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!isAllowedHref(url)) {
      window.alert('כתובת לא חוקית.');
      return;
    }
    const external = /^https?:\/\//i.test(url) && !url.includes(window.location.host);
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.trim(), target: external ? '_blank' : null, rel: external ? 'noopener noreferrer' : null })
      .run();
  }

  function insertYoutube() {
    if (!editor) return;
    const value = window.prompt('קישור לסרטון YouTube או מזהה הסרטון:');
    if (!value) return;
    const id = youtubeIdFrom(value);
    if (!id) {
      window.alert('לא זוהה סרטון YouTube בקישור.');
      return;
    }
    editor.chain().focus().insertContent({ type: 'rawBlock', attrs: { html: youtubeEmbedHtml(id) } }).run();
  }

  function insertEmbed(kind: EmbedPlaceholder) {
    editor?.chain().focus().insertContent({ type: 'rawBlock', attrs: { html: embedPlaceholderHtml(kind) } }).run();
  }

  function insertFaq() {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'details',
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'שאלה' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'תשובה' }] },
        ],
      })
      .run();
  }

  function editRaw() {
    if (!editor) return;
    const { selection } = editor.state;
    const node = 'node' in selection ? (selection as { node: { type: { name: string }; attrs: { html: string } } }).node : null;
    if (!node || (node.type.name !== 'rawBlock' && node.type.name !== 'rawInline')) return;
    const html = window.prompt('עריכת קוד HTML של הרכיב:', node.attrs.html);
    if (html === null) return;
    editor.chain().focus().updateAttributes(node.type.name, { html }).run();
  }

  function editImageAlt() {
    if (!editor) return;
    const attrs = (editor.getAttributes('image').htmlAttrs as Record<string, string> | null) ?? {};
    const alt = window.prompt('טקסט חלופי לתמונה (לנגישות ולקידום):', attrs.alt ?? '');
    if (alt === null) return;
    editor.chain().focus().updateAttributes('image', { htmlAttrs: { ...attrs, alt } }).run();
  }

  const e = editor;
  const s = state;

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-100">
      <input type="hidden" name={name} value={stored} readOnly />
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-gray-200 bg-gray-50/95 px-2 py-1.5 backdrop-blur" role="toolbar" aria-label="עיצוב טקסט">
        {mode === 'visual' && e && s ? (
          <>
            <select
              aria-label="סוג פסקה"
              className="me-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              value={s.block}
              onChange={(ev) => {
                const v = ev.target.value;
                if (v === 'p') e.chain().focus().setParagraph().run();
                else e.chain().focus().setHeading({ level: Number(v.slice(1)) as 2 | 3 | 4 }).run();
              }}
            >
              <option value="p">פסקה</option>
              <option value="h2">כותרת 2</option>
              <option value="h3">כותרת 3</option>
              <option value="h4">כותרת 4</option>
            </select>
            <Btn title="מודגש" active={s.bold} onClick={() => e.chain().focus().toggleBold().run()}>
              <b>B</b>
            </Btn>
            <Btn title="נטוי" active={s.italic} onClick={() => e.chain().focus().toggleItalic().run()}>
              <i>I</i>
            </Btn>
            <Btn title="קו תחתון" active={s.underline} onClick={() => e.chain().focus().toggleUnderline().run()}>
              <u>U</u>
            </Btn>
            <Btn title="קו חוצה" active={s.strike} onClick={() => e.chain().focus().toggleStrike().run()}>
              <s>S</s>
            </Btn>
            <Btn title="קישור" active={s.link} onClick={editLink}>
              🔗
            </Btn>
            <Sep />
            <Btn title="רשימת תבליטים" active={s.bullet} onClick={() => e.chain().focus().toggleBulletList().run()}>
              •≡
            </Btn>
            <Btn title="רשימה ממוספרת" active={s.ordered} onClick={() => e.chain().focus().toggleOrderedList().run()}>
              1≡
            </Btn>
            <Btn title="ציטוט" active={s.quote} onClick={() => e.chain().focus().toggleBlockquote().run()}>
              ❝
            </Btn>
            <Btn title="קו מפריד" onClick={() => e.chain().focus().setHorizontalRule().run()}>
              ―
            </Btn>
            <Sep />
            <Btn title="יישור לימין" active={s.align === 'right'} onClick={() => setAlign(e, 'right')}>
              ⇥
            </Btn>
            <Btn title="מרכוז" active={s.align === 'center'} onClick={() => setAlign(e, 'center')}>
              ≡
            </Btn>
            <Btn title="יישור לשמאל" active={s.align === 'left'} onClick={() => setAlign(e, 'left')}>
              ⇤
            </Btn>
            <Btn title="ללא יישור" onClick={() => setAlign(e, null)}>
              ⌀
            </Btn>
            <Sep />
            <Btn title="תמונה מספריית המדיה" onClick={() => setPicker(true)}>
              🖼
            </Btn>
            {s.image && (
              <Btn title="טקסט חלופי לתמונה" onClick={editImageAlt}>
                alt
              </Btn>
            )}
            <Btn title="סרטון YouTube" onClick={insertYoutube}>
              ▶
            </Btn>
            <Btn title="הוספת טבלה" onClick={() => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              ▦
            </Btn>
            <Btn title="שאלה ותשובה (FAQ)" onClick={insertFaq}>
              ؟
            </Btn>
            <select
              aria-label="הוספת רכיב"
              className="ms-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              value=""
              onChange={(ev) => {
                const v = ev.target.value as EmbedPlaceholder;
                if (v) insertEmbed(v);
              }}
            >
              <option value="">+ רכיב…</option>
              {(Object.keys(EMBED_PLACEHOLDERS) as EmbedPlaceholder[]).map((k) => (
                <option key={k} value={k}>
                  {EMBED_PLACEHOLDERS[k]}
                </option>
              ))}
            </select>
            {s.raw && (
              <Btn title="עריכת קוד HTML של הרכיב המסומן" onClick={editRaw}>
                {'</>'}
              </Btn>
            )}
            <Sep />
            <Btn title="ביטול" disabled={!s.canUndo} onClick={() => e.chain().focus().undo().run()}>
              ↶
            </Btn>
            <Btn title="חזרה" disabled={!s.canRedo} onClick={() => e.chain().focus().redo().run()}>
              ↷
            </Btn>
          </>
        ) : mode === 'html' ? (
          <span className="px-2 text-sm text-gray-600">עריכת קוד HTML</span>
        ) : (
          <span className="px-2 text-sm text-gray-400">טוען עורך…</span>
        )}
        <span className="ms-auto" />
        <Btn title={mode === 'visual' ? 'מעבר לעריכת HTML' : 'חזרה לעורך החזותי'} onClick={() => switchMode(mode === 'visual' ? 'html' : 'visual')}>
          {mode === 'visual' ? 'HTML' : 'עורך'}
        </Btn>
      </div>
      {s?.table && mode === 'visual' && e && (
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-amber-50/60 px-2 py-1 text-xs">
          <span className="text-gray-600">טבלה:</span>
          <Btn title="שורה מתחת" onClick={() => e.chain().focus().addRowAfter().run()}>
            + שורה
          </Btn>
          <Btn title="עמודה" onClick={() => e.chain().focus().addColumnAfter().run()}>
            + עמודה
          </Btn>
          <Btn title="מחיקת שורה" onClick={() => e.chain().focus().deleteRow().run()}>
            − שורה
          </Btn>
          <Btn title="מחיקת עמודה" onClick={() => e.chain().focus().deleteColumn().run()}>
            − עמודה
          </Btn>
          <Btn title="שורת כותרת" onClick={() => e.chain().focus().toggleHeaderRow().run()}>
            כותרת
          </Btn>
          <Btn title="מחיקת הטבלה" onClick={() => e.chain().focus().deleteTable().run()}>
            מחיקת טבלה
          </Btn>
        </div>
      )}
      {mode === 'visual' ? (
        <div className="px-4 py-3">
          {e ? <EditorContent editor={e} /> : <div style={{ minHeight }} className="animate-pulse rounded bg-gray-50" />}
        </div>
      ) : (
        <textarea
          aria-label="קוד HTML"
          dir="ltr"
          value={source}
          onChange={(ev) => {
            setSource(ev.target.value);
            setStored(ev.target.value);
          }}
          className="block w-full rounded-b-xl border-0 p-3 font-mono text-xs leading-5 focus:outline-none"
          style={{ minHeight }}
        />
      )}
      <MediaPicker
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={(url) => {
          const alt = window.prompt('טקסט חלופי לתמונה (לנגישות ולקידום):', '') ?? '';
          e?.chain()
            .focus()
            .insertContent({ type: 'image', attrs: { src: url, htmlAttrs: { alt, loading: 'lazy' } } })
            .run();
        }}
      />
    </div>
  );
}
