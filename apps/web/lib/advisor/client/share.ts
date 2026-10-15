/**
 * Sharing an answer. The browser makes the share id itself (random, 16
 * characters, the same alphabet as lib/advisor/share.ts), so the WhatsApp link
 * opens inside the tap (no popup blocker), while the signed snapshot is sent
 * to POST /api/advisor/share with `keepalive` and is stored before anyone opens
 * the link. Client-safe.
 */
import { stripCitations } from '../citations';
import type { AdvisorSharePayload } from '../types';

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const SHARE_ENDPOINT = '/api/advisor/share';

export function newShareId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < bytes.length; i++) id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return id;
}

export function shareUrl(id: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/ask/a/${id}/`;
}

/** Markdown to one plain line of text (headings, bold, bullets, tables and citations removed). */
export function plainText(markdown: string): string {
  return stripCitations(markdown)
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*\|?[-:|\s]+\|?\s*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The opening of an answer, cut at a word near `max` characters. */
export function answerTeaser(markdown: string, max = 180): string {
  const text = plainText(markdown);
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max);
  return `${text.slice(0, cut > max * 0.6 ? cut : max).trim()}…`;
}

/** WhatsApp message: the question, the bottom line and the link. */
export function shareMessage(question: string, answer: string, url: string, advisorName: string): string {
  return `${advisorName}: ${question.trim()}\n\n${answerTeaser(answer)}\n\nהתשובה המלאה, עם הרגע המדויק בסרטון:\n${url}`;
}

/** wa.me with text only: WhatsApp lets the visitor pick the chat. */
export function whatsappShareHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Store the snapshot (fire and forget; survives the visitor leaving for WhatsApp). */
export function publishShare(id: string, payload: AdvisorSharePayload, signature: string, endpoint = SHARE_ENDPOINT): Promise<boolean> {
  try {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, payload, signature }),
      keepalive: true,
    })
      .then((r) => r.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
