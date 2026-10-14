/**
 * JSON for an inline <script type="application/ld+json">. "<" is escaped
 * (<), so text inside the data (titles, summaries, generated or edited
 * copy) can never close the tag or open a comment; the JSON value is unchanged.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
