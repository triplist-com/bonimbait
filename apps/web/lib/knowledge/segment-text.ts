/**
 * Video index rows store "<video title>\n<segment text>" (scripts/build_search_index.py),
 * like post chunks start with the post title: the title is part of what gets matched and
 * embedded. Where the title is already shown, use only the transcript part.
 */
export function segmentBody(text: string, title: string | undefined): string {
  if (title && text.startsWith(`${title}\n`)) return text.slice(title.length + 1);
  return text;
}

/**
 * A title-level row: a video without captions, indexed by its title and chapter titles
 * only. Findable in search, but it has no transcript to ground an answer and no moments.
 */
export function isTitleOnly(hit: object): boolean {
  return Boolean((hit as { title_only?: boolean }).title_only);
}
