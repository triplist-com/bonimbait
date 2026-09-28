/**
 * CSV for Excel: UTF-8 BOM (so Hebrew opens correctly), CRLF, RFC 4180
 * quoting, and a leading apostrophe on values Excel would run as formulas.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
