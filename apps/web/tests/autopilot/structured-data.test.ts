/**
 * Runtime video pages put generated text (titles, summaries, chapter names)
 * into JSON-LD (components/StructuredData.tsx): it must never be able to close
 * the <script> tag.
 */
import { describe, expect, it } from 'vitest';
import { jsonLdHtml } from '@/lib/jsonld';

describe('jsonLdHtml', () => {
  it('escapes "<" so data cannot break out of the script tag, keeping the same JSON', () => {
    const data = { '@type': 'VideoObject', name: 'חיפוי </script><script>alert(1)</script> <!-- x' };
    const html = jsonLdHtml(data);
    expect(html).not.toContain('<');
    expect(JSON.parse(html)).toEqual(data);
  });
});
