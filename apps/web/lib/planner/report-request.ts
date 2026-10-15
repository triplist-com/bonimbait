/** Client-safe parts of the "שלחו לי את הדוח" request (the action is lib/planner/actions.ts). */

export type ReportRequestState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
  /** The lead's human-readable id (BB-YY-NNNNNN). */
  ref?: string | null;
  submittedAt?: number;
};

export const INITIAL_REPORT_REQUEST: ReportRequestState = { status: 'idle' };

/** One field for "email or phone": anything with "@" is an email. */
export function splitContact(raw: string): { email?: string; phone?: string } {
  const value = raw.trim();
  if (!value) return {};
  return value.includes('@') ? { email: value } : { phone: value };
}
