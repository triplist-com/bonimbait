// @vitest-environment happy-dom
/**
 * Opt-in: round-trip every migrated post/page/video page through the editor.
 *
 *   docker exec -i supabase_db_bonimbait psql -U postgres -At \
 *     -c "select json_agg(json_build_object('slug',slug,'html',content_html)) from posts" > /tmp/posts.json
 *   NODE_OPTIONS=--max-old-space-size=8000 EDITOR_CORPUS=/tmp/posts.json npx vitest run tests/admin/editor-roundtrip-corpus.test.ts
 *
 * Several files can be passed, comma-separated.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonical, firstDiff, roundTrip } from './editor-harness';

const files = (process.env.EDITOR_CORPUS ?? '').split(',').filter(Boolean);

describe.skipIf(files.length === 0)('editor round-trip over the migrated corpus', () => {
  it('keeps every document rendering-equivalent', () => {
    const failures: string[] = [];
    let total = 0;
    for (const file of files) {
      const rows = JSON.parse(readFileSync(file, 'utf8')) as Array<{ slug: string; html: string | null }>;
      for (const row of rows) {
        total += 1;
        if (process.env.EDITOR_CORPUS_TRACE) appendFileSync(process.env.EDITOR_CORPUS_TRACE, `${total} ${row.slug} ${(row.html ?? "").length}\n`);
        const stored = row.html ?? '';
        const saved = roundTrip(stored);
        const diff = firstDiff(canonical(stored), canonical(saved));
        if (diff) failures.push(`${file}:${row.slug} ${diff}`);
        // Saving twice must be stable.
        else if (roundTrip(saved) !== saved) failures.push(`${file}:${row.slug} not idempotent`);
      }
    }
    if (failures.length) console.log(failures.slice(0, 15).join('\n\n'));
    console.log(`round-trip: ${total - failures.length}/${total} documents equivalent`);
    expect(failures).toEqual([]);
  }, 30 * 60_000);
});
