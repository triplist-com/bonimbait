/**
 * Bidi helpers for numbers inside Hebrew strings (plain text, not JSX).
 *
 * In an RTL paragraph a range like "2.4–2.8" renders reversed ("2.8–2.4") and
 * a signed value like "+2.1%" loses its sign position. Wrapping the token in
 * Unicode isolates (LRI … PDI) keeps it left-to-right, the plain-text
 * equivalent of the `.num` class. Invisible on screen; pure.
 */

const LRI = '⁦';
const PDI = '⁩';

/** Isolate a number, range or sign as LTR: ltr('2.4–2.8'). */
export function ltr(token: string | number): string {
  return `${LRI}${token}${PDI}`;
}

/** Remove the isolates again (tests, plain-text exports, OG images). */
export function stripIsolates(text: string): string {
  return text.replace(/[⁦-⁩]/g, '');
}
