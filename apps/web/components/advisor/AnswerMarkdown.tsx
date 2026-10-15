'use client';

/**
 * Renders an advisor answer from the safe markdown AST (lib/advisor/markdown.ts).
 * Everything is a React text node or an element we create, so nothing the
 * model writes can become HTML. Numbers sit in LTR isolates (ranges and
 * prices never flip in RTL), and [n] citations are chips that scroll to and
 * highlight their source card.
 */
import { Fragment, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { parseMarkdown, splitNumbers, type Block, type Inline } from '@/lib/advisor/markdown';
import type { AdvisorSource } from '@/lib/advisor/types';

export interface AnswerMarkdownProps {
  markdown: string;
  streaming?: boolean;
  sources?: AdvisorSource[];
  onCite?: (n: number) => void;
  className?: string;
}

function TextWithNumbers({ text }: { text: string }) {
  return (
    <>
      {splitNumbers(text).map((seg, i) =>
        seg.num ? (
          <span key={i} dir="ltr" className="[unicode-bidi:isolate]">
            {seg.v}
          </span>
        ) : (
          <Fragment key={i}>{seg.v}</Fragment>
        ),
      )}
    </>
  );
}

function CitationChips({ ns, sources, onCite }: { ns: number[]; sources?: AdvisorSource[]; onCite?: (n: number) => void }) {
  return (
    <span className="ms-1 inline-flex translate-y-[-0.1em] gap-0.5 align-baseline">
      {ns.map((n) => {
        const source = sources?.find((s) => s.n === n);
        const label = source ? `מקור ${n}: ${source.title}` : `מקור ${n}`;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onCite?.(n)}
            aria-label={label}
            title={source?.title}
            className={cn(
              'num inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-primary-200 bg-primary-50 px-1.5',
              'text-[0.6875rem] font-bold leading-none text-primary-700 transition-colors',
              'hover:border-primary-600 hover:bg-primary-600 hover:text-white',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
            )}
          >
            {n}
          </button>
        );
      })}
    </span>
  );
}

function renderInline(nodes: Inline[], ctx: { sources?: AdvisorSource[]; onCite?: (n: number) => void }): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <TextWithNumbers key={i} text={n.v} />;
      case 'strong':
        return (
          <strong key={i} className="font-bold text-ink-900">
            {renderInline(n.c, ctx)}
          </strong>
        );
      case 'em':
        return <em key={i}>{renderInline(n.c, ctx)}</em>;
      case 'br':
        return <br key={i} />;
      case 'cite':
        return <CitationChips key={i} ns={n.ns} sources={ctx.sources} onCite={ctx.onCite} />;
      default:
        return null;
    }
  });
}

function renderBlock(b: Block, i: number, ctx: { sources?: AdvisorSource[]; onCite?: (n: number) => void }): ReactNode {
  switch (b.t) {
    case 'p':
      return <p key={i}>{renderInline(b.c, ctx)}</p>;
    case 'h':
      return b.level === 3 ? (
        <h3 key={i} className="pt-2 text-title text-ink-900">
          {renderInline(b.c, ctx)}
        </h3>
      ) : (
        <h4 key={i} className="pt-1 text-title-sm text-ink-900">
          {renderInline(b.c, ctx)}
        </h4>
      );
    case 'ul':
      return (
        <ul key={i} className="space-y-2 ps-5 [&>li]:relative [&>li]:ps-1 [&>li]:before:absolute [&>li]:before:-start-4 [&>li]:before:top-[0.72em] [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary-600 [&>li]:before:content-['']">
          {b.items.map((item, k) => (
            <li key={k}>{renderInline(item, ctx)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={i} start={b.start} className="list-decimal space-y-2 ps-6 marker:font-bold marker:text-primary-700">
          {b.items.map((item, k) => (
            <li key={k} className="ps-1">
              {renderInline(item, ctx)}
            </li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote key={i} className="border-s-4 border-primary-200 ps-4 text-ink-700">
          {renderInline(b.c, ctx)}
        </blockquote>
      );
    case 'table':
      return (
        <div key={i} className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[18rem] border-collapse overflow-hidden rounded-2xl text-body-sm">
            <thead>
              <tr className="bg-sand-100 text-ink-900">
                {b.head.map((cell, k) => (
                  <th key={k} scope="col" className="border-b border-sand-200 px-3 py-2 text-start font-bold">
                    {renderInline(cell, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r} className="border-b border-ink-100 last:border-0">
                  {row.map((cell, k) => (
                    <td key={k} className="px-3 py-2 align-top text-ink-700">
                      {renderInline(cell, ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr key={i} className="border-ink-100" />;
    default:
      return null;
  }
}

function Caret() {
  return <span aria-hidden="true" className="ms-1 inline-block h-[1.05em] w-[3px] translate-y-[0.18em] rounded-full bg-primary-600 motion-safe:animate-pulse" />;
}

export default function AnswerMarkdown({ markdown, streaming, sources, onCite, className }: AnswerMarkdownProps) {
  const maxCite = sources?.length ?? 0;
  const blocks = useMemo(() => parseMarkdown(markdown, { maxCite, streaming }), [markdown, maxCite, streaming]);
  const ctx = { sources, onCite };
  const last = blocks[blocks.length - 1];
  // The caret follows the text: inside the last paragraph, else on its own line.
  const caretInside = streaming && last?.t === 'p';
  return (
    <div className={cn('space-y-3.5 text-body text-ink-800 [&_p]:leading-[1.8]', className)}>
      {blocks.map((b, i) =>
        caretInside && i === blocks.length - 1 && b.t === 'p' ? (
          <p key={i}>
            {renderInline(b.c, ctx)}
            <Caret />
          </p>
        ) : (
          renderBlock(b, i, ctx)
        ),
      )}
      {streaming && !caretInside && (
        <p>
          <Caret />
        </p>
      )}
    </div>
  );
}
