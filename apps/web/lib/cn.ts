/**
 * Join class names, skipping falsy values (a dependency-free `clsx`).
 *
 *   cn('btn', isActive && 'btn-active', { 'opacity-50': disabled }, ['a', ['b']])
 *
 * It does not resolve Tailwind conflicts: pass layout classes (margin, width,
 * grid placement) through `className`, and use component props for variants.
 */
export type ClassValue = string | number | null | undefined | false | ClassValue[] | { [cls: string]: unknown };

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue): void => {
    if (!value && value !== 0) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const s = String(value).trim();
      if (s) out.push(s);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === 'object') {
      for (const [cls, on] of Object.entries(value)) if (on) out.push(cls);
    }
  };
  inputs.forEach(walk);
  return out.join(' ');
}
