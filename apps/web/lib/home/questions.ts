/**
 * Example questions for the ask box: hero placeholder rotation (the first one
 * is the default placeholder), suggestion chips and the mobile ask sheet.
 * Each is well covered by the indexed videos and articles. Client-safe.
 */

export interface ExampleQuestion {
  text: string;
  topic: string;
}

export const EXAMPLE_QUESTIONS: ExampleQuestion[] = [
  { text: 'כמה עולה שלד לבית של 200 מ״ר?', topic: 'עלויות' },
  { text: 'איך בוחרים קבלן שלד בלי להיכוות?', topic: 'קבלנים' },
  { text: 'מה חייבים לבדוק לפני יציקת בטון?', topic: 'שלד' },
  { text: 'כמה עולה ריצוף למ״ר?', topic: 'גמרים' },
  { text: 'מה זה רצפה צפה ומתי כדאי?', topic: 'גמרים' },
  { text: 'איך חוסכים עשרות אלפי שקלים בבנייה?', topic: 'תקציב' },
  { text: 'כמה זמן לוקח לקבל היתר בנייה?', topic: 'רישוי' },
  { text: 'איך מתכננים חשמל בבית חדש?', topic: 'תשתיות' },
];

/** Next index in a rotation, wrapping at the end. */
export function nextIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}
