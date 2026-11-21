/**
 * Client-side check that a dropped file is the one plan the demo supports
 * (plot 43, "Home-Model.pdf"). The file never leaves the browser.
 */

export type FileCheckResult =
  | { ok: true }
  | { ok: false; reason: 'not-pdf' | 'unsupported' | 'unreadable' };

const SUPPORTED_SIZE = 489_533;
const MAX_SCAN_BYTES = 25 * 1024 * 1024;

export async function checkPlanFile(file: File): Promise<FileCheckResult> {
  const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!looksPdf) return { ok: false, reason: 'not-pdf' };
  if (file.size > MAX_SCAN_BYTES) return { ok: false, reason: 'unsupported' };

  let text: string;
  try {
    const buf = await file.arrayBuffer();
    text = new TextDecoder('latin1').decode(new Uint8Array(buf));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (!text.startsWith('%PDF')) return { ok: false, reason: 'not-pdf' };

  // Reliable markers of the supported sheet (AutoCAD plot, one 1899x1701 pt page).
  const markers = [
    file.size === SUPPORTED_SIZE,
    text.includes('/Title (Model)'),
    text.includes('AutoCAD'),
    /\/MediaBox\s*\[\s*0\s+0\s+1899\s+1701\s*\]/.test(text),
  ];
  const hits = markers.filter(Boolean).length;
  // Exact size is enough on its own; otherwise require most of the fingerprints.
  return markers[0] || hits >= 3 ? { ok: true } : { ok: false, reason: 'unsupported' };
}
