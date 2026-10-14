/**
 * Satori (next/og) lays text out left-to-right and has no bidi support, so
 * Hebrew renders reversed ("תיב םינוב"). These helpers pre-order Hebrew text
 * for it. Use only on Hebrew without digits or Latin; put those in their own
 * element. Pure.
 */

/** Visual order of a Hebrew line for an LTR renderer: "בונים בית" -> "תיב םינוב". */
export function visualHebrew(text: string): string {
  return Array.from(text).reverse().join('');
}

/**
 * Words of a Hebrew line in left-to-right visual order, each pre-reversed, for
 * styling single words (e.g. one word in magenta) in a flex row.
 * visualWords("אתכם עד המפתח") -> ["חתפמה", "דע", "םכתא"]
 */
export function visualWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map(visualHebrew);
}
