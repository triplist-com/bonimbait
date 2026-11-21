/**
 * Construction methods the demo can build the same house with (docs/build3d/METHODS.md).
 *
 * Pure constants: safe to import from the landing (no three.js, no step engine).
 * Each method is a different list of phase builders (lib/build3d/steps/methods/**);
 * the finished house looks the same, the structure and envelope differ.
 */
export const METHOD_IDS = ['concrete', 'icf', 'steel', 'timber', 'precast'] as const;
export type MethodId = (typeof METHOD_IDS)[number];

export const DEFAULT_METHOD: MethodId = 'concrete';

export function isMethodId(v: unknown): v is MethodId {
  return typeof v === 'string' && (METHOD_IDS as readonly string[]).includes(v);
}

/** `?method=` value → MethodId (unknown or missing → the default). */
export function parseMethod(v: string | null | undefined): MethodId {
  return isMethodId(v) ? v : DEFAULT_METHOD;
}

/** Read `?method=` from the current URL (client only). */
export function readUrlMethod(): MethodId {
  if (typeof window === 'undefined') return DEFAULT_METHOD;
  return parseMethod(new URLSearchParams(window.location.search).get('method'));
}
