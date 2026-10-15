/**
 * Trade topics: what a builder's question is about, and which directory
 * specialties (specialties.slug) sell that work.
 *
 * One map feeds the whole revenue engine:
 *   - lead scoring ("4 שאלות על אלומיניום" is an intent signal),
 *   - routing rules (a consult file asking about windows can go to a windows partner),
 *   - sponsored offers (a video about plaster shows a plaster partner),
 *   - intent attribution in the pro portal and the partner report ("112 בונים
 *     שאלו על חלונות"): the SQL RPCs match the same patterns with `~*`.
 *
 * Patterns are plain alternations of Hebrew stems, valid both as JS RegExp
 * and PostgreSQL POSIX regex (no lookarounds, no \b: Hebrew prefixes like
 * ה/ו/ב/ל/מ/ש attach to the word, so stems match anywhere).
 *
 * Pure and client-safe.
 */

export type TopicKey =
  | 'windows'
  | 'frame'
  | 'turnkey'
  | 'electric'
  | 'smart-home'
  | 'plumbing'
  | 'waterproofing'
  | 'roofing'
  | 'solar'
  | 'hvac'
  | 'flooring'
  | 'kitchen'
  | 'finishing'
  | 'doors'
  | 'outdoor'
  | 'safe-room'
  | 'architect'
  | 'engineering'
  | 'interior'
  | 'renovation'
  | 'mortgage'
  | 'insurance';

export type Topic = {
  key: TopicKey;
  /** Short Hebrew noun for "N שאלות על <label>". */
  label: string;
  /** Longer title for reports ("בונים ששאלו על חלונות ואלומיניום"). */
  title: string;
  /** Regex alternation of stems (JS and PostgreSQL compatible). */
  pattern: string;
  /** specialties.slug values (decoded) that sell this work. */
  specialtySlugs: readonly string[];
};

export const TOPICS: readonly Topic[] = [
  {
    key: 'windows',
    label: 'אלומיניום',
    title: 'חלונות ואלומיניום',
    pattern: 'אלומיני|חלון|חלונות|תריס|ויטרינ|זכוכית|זיגוג|סלייד',
    specialtySlugs: ['קבלני-אלומיניום', 'חלונות-ברזל', 'מנועים-ואביזרים-לתריסי-גלילה'],
  },
  {
    key: 'frame',
    label: 'שלד',
    title: 'עבודות שלד',
    pattern: 'שלד|יציק|בטון|ברזל זיון|יסודות|כלונס|קונסטרוקצי|icf|בלוק|בניה קלה|בנייה קלה|טרומי',
    specialtySlugs: [
      'קבלני-שלד',
      'קונסטרוקטורים',
      'icf',
      'קבלני-בניה-מתקדמת',
      'בניה-מתקדמת',
      'יצרני-בטון',
      'יצרני-בטון-בלוקים',
      'שיקום-מבנים-ובטון',
    ],
  },
  {
    key: 'turnkey',
    label: 'קבלן מפתח',
    title: 'קבלני מפתח',
    pattern: 'קבלן מפתח|קבלני מפתח|עד מפתח|קבלן ראשי',
    specialtySlugs: ['קבלני-מפתח'],
  },
  {
    key: 'electric',
    label: 'חשמל',
    title: 'חשמל ותאורה',
    pattern: 'חשמל|תאורה|שקעים|נקודות חשמל|מתח נמוך|תקשורת',
    specialtySlugs: ['קבלני-חשמל', 'קבלני-מתח-נמוך', 'תוכניות-מתח-נמוך', 'חשמל-חכם', 'חנות-תאורה', 'מערכות-תקשורת-ואינטרנט'],
  },
  {
    key: 'smart-home',
    label: 'בית חכם',
    title: 'בית חכם ומיגון',
    pattern: 'בית חכם|אינטרקום|מצלמ|אזעק|מיגון|קולנוע|אודיו',
    specialtySlugs: ['קבלני-בית-חכם', 'חברת-בית-חכם', 'אינטרקום', 'מצלמות', 'אזעקות', 'מערכות-אודיו-וידאו', 'קולנוע-ביתי'],
  },
  {
    key: 'plumbing',
    label: 'אינסטלציה',
    title: 'אינסטלציה וגז',
    pattern: 'אינסטלצי|צנרת|ביוב|ניקוז|מים חמים|מחמם מים|דוד חשמל|תשתית גז|תשתיות גז|גז טבעי|בגז',
    specialtySlugs: ['קבלני-אינסטלציה', 'יועצי-אינסטלציה', 'קבלני-תשתיות-גז'],
  },
  {
    key: 'waterproofing',
    label: 'איטום',
    title: 'איטום ורטיבות',
    pattern: 'איטום|אוטם|רטיבות|נזיל|ממברנ|זפת',
    specialtySlugs: ['קבלני-איטום', 'יועץ-איטום', 'איטום', 'ספקי-חומרי-איטום'],
  },
  {
    key: 'roofing',
    label: 'גגות',
    title: 'גגות ורעפים',
    pattern: 'גגות|גג רעפים|רעפים|גגן|הגג',
    specialtySlugs: ['גגנים', 'קבלני-גגות-סולאריים'],
  },
  {
    key: 'solar',
    label: 'סולארי',
    title: 'אנרגיה סולארית',
    pattern: 'סולאר|פאנל|דוד שמש|מערכת פוטו',
    specialtySlugs: ['קבלני-גגות-סולאריים', 'מתקיני-דודי-שמש-וחשמל'],
  },
  {
    key: 'hvac',
    label: 'מיזוג',
    title: 'מיזוג וחימום',
    pattern: 'מיזוג|מזגן|מזגנ|מיני מרכזי|vrf|חימום|תת רצפתי|קמין|מאוורר',
    specialtySlugs: ['קבלני-מיזוג', 'יועץ-מיזוג', 'מערכות-חימום-תת-רצפתי', 'חנות-קמינים', 'חנות-מאווררים'],
  },
  {
    key: 'flooring',
    label: 'ריצוף',
    title: 'ריצוף וחיפוי',
    pattern: 'ריצוף|ריצפ|רצפ|אריח|פרקט|פורצלן|מיקרוטופינג|משטח שיש|משטחי שיש|אבן ושיש|חיפוי',
    specialtySlugs: ['קבלני-ריצוף', 'חנות-פרקטים', 'חנות-ריצוף-וסנטיריה', 'קבלני-מיקרוטופינג', 'מעבדי-שיש', 'ספקי-אבן-ושיש'],
  },
  {
    key: 'kitchen',
    label: 'מטבח',
    title: 'מטבחים ונגרות',
    pattern: 'מטבח|נגר|ארונות|ארון',
    specialtySlugs: ['חנות-מטבחים', 'נגרים', 'ספקי-מטבחי-חוץ'],
  },
  {
    key: 'finishing',
    label: 'גמרים',
    title: 'עבודות גמר',
    pattern: 'גמרים|עבודות גמר|שלב הגמר|טיח|גבס|צבע|סניטרי|סנטרי|מקלחון|אמבטי|חדר רחצה|חדרי רחצה',
    specialtySlugs: ['קבלני-גמרים', 'קבלני-טיח', 'קבלני-גבס', 'חנות-מקלחונים', 'ספקי-חדרי-רחצה', 'חומרי-גמרים', 'ייבוא-חומרי-גמר'],
  },
  {
    key: 'doors',
    label: 'דלתות',
    title: 'דלתות',
    pattern: 'דלת|דלתות|מנעול',
    specialtySlugs: ['מתקיני-דלתות-כניסה', 'מתקיני-דלתות-פנים', 'מנעולנים'],
  },
  {
    key: 'outdoor',
    label: 'פיתוח חוץ',
    title: 'פרגולות, גינה ופיתוח חוץ',
    pattern: 'פרגול|גדר|מעקה|גינה|גינון|דשא|השקיה|בריכ|פיתוח חוץ|חצר',
    specialtySlugs: [
      'קבלני-פרגולות-עץ',
      'קבלני-פרגולות-אלומיניום',
      'קבלני-גדרות-ומעקות',
      'גננים',
      'אדריכלי-נוף',
      'אגרונומים',
      'בריכות-שחיה',
    ],
  },
  {
    key: 'safe-room',
    label: 'ממ״ד',
    title: 'ממ״ד ומיגון',
    pattern: 'ממ"ד|ממ״ד|חדר ביטחון|מרחב מוגן',
    specialtySlugs: ['מוצרים-לממד', 'מערכות-סינון-אוויר-לממד', 'מזגן-לממד'],
  },
  {
    key: 'architect',
    label: 'אדריכלות',
    title: 'אדריכלות ותכנון',
    pattern: 'אדריכל|הדמי|תכנון הבית|תוכניות הבית',
    specialtySlugs: ['אדריכלים', 'ביצוע-הדמיות'],
  },
  {
    key: 'engineering',
    label: 'הנדסה',
    title: 'הנדסה, מדידות ובדיקות',
    pattern: 'מהנדס|מודד|מדידה|יועץ קרקע|בדיקת קרקע|בדק בית|מפקח|פיקוח',
    specialtySlugs: ['מהנדסי-בניין', 'מודדים', 'יועץ-קרקע', 'בדיקות-מעבדה', 'חברות-בדק-בית', 'מפקחי-בניה'],
  },
  {
    key: 'interior',
    label: 'עיצוב פנים',
    title: 'עיצוב פנים',
    pattern: 'מעצב|עיצוב פנים|עיצוב הבית',
    specialtySlugs: ['מעצבי-פנים'],
  },
  {
    key: 'renovation',
    label: 'שיפוץ',
    title: 'שיפוצים',
    pattern: 'שיפוץ|שיפוצ|משפצ',
    specialtySlugs: ['קבלני-שיפוצים'],
  },
  {
    key: 'mortgage',
    label: 'משכנתא',
    title: 'משכנתא ומימון',
    pattern: 'משכנת|מימון|הלוואה|ריבית',
    specialtySlugs: ['יועץ-משכנתא'],
  },
  {
    key: 'insurance',
    label: 'ביטוח',
    title: 'ביטוח בנייה',
    pattern: 'ביטוח',
    specialtySlugs: ['ביטוח-בניה'],
  },
];

const TOPIC_BY_KEY = new Map(TOPICS.map((t) => [t.key, t]));

/** Price and cost words ("כמה עולה", "מחיר", "למ״ר", "₪"). */
export const COST_PATTERN =
  'כמה עול|כמה זה עול|כמה יעלה|כמה יעלו|מחיר|עלות|עלויות|תקציב|₪|שקלים|אלף שקל|אלפי שקל|מיליון שקל|ש"ח|ש״ח|הצעת מחיר|הצעות מחיר|יקר|זול|לחסוך|חיסכון|למ"ר|למ״ר|למטר';

/** Hiring words: the builder is choosing a contractor or supplier. */
export const HIRING_PATTERN =
  'קבלן|קבלנ|בעל מקצוע|בעלי מקצוע|בעל המקצוע|ספקים|ספק |מתקין|המלצ|ממליצ|לבחור|בוחרים|הצעת מחיר|הצעות מחיר';

const COST_RE = new RegExp(COST_PATTERN, 'i');
const HIRING_RE = new RegExp(HIRING_PATTERN, 'i');
const TOPIC_RES = TOPICS.map((t) => [t.key, new RegExp(t.pattern, 'i')] as const);

export function normalizeQuestion(text: string): string {
  return text.normalize('NFC').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim();
}

export type QuestionIntent = {
  /** Asks about a price or cost. */
  cost: boolean;
  /** Asks about a trade, a contractor or a supplier (a pro could sell this). */
  pro: boolean;
  topics: TopicKey[];
};

/** What a question is about. Never throws. */
export function classifyQuestion(text: string | null | undefined): QuestionIntent {
  const q = normalizeQuestion(String(text ?? ''));
  if (!q) return { cost: false, pro: false, topics: [] };
  const topics = TOPIC_RES.filter(([, re]) => re.test(q)).map(([key]) => key);
  return { cost: COST_RE.test(q), pro: topics.length > 0 || HIRING_RE.test(q), topics };
}

export function getTopic(key: string | null | undefined): Topic | undefined {
  return key ? TOPIC_BY_KEY.get(key as TopicKey) : undefined;
}

export function isTopicKey(value: unknown): value is TopicKey {
  return typeof value === 'string' && TOPIC_BY_KEY.has(value as TopicKey);
}

/** Topics a specialty sells (by decoded slug). */
export function topicsForSpecialty(slug: string | null | undefined): TopicKey[] {
  if (!slug) return [];
  const norm = slug.normalize('NFC');
  return TOPICS.filter((t) => t.specialtySlugs.includes(norm)).map((t) => t.key);
}

/** Specialty slugs that sell any of `topics` (deduped, in topic order). */
export function specialtiesForTopics(topics: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of topics) {
    for (const slug of getTopic(key)?.specialtySlugs ?? []) if (!out.includes(slug)) out.push(slug);
  }
  return out;
}

/** Regex patterns for SQL (`props->>'query' ~* any(patterns)`). */
export function topicPatterns(topics: readonly string[]): string[] {
  return topics.map((k) => getTopic(k)?.pattern).filter((p): p is string => Boolean(p));
}

export type TopicCount = { key: TopicKey; label: string; title: string; count: number };

/** The topics a set of questions is about, most asked first (ties: TOPICS order). */
export function topicCounts(questions: readonly string[]): TopicCount[] {
  const counts = new Map<TopicKey, number>();
  for (const q of questions) {
    for (const key of classifyQuestion(q).topics) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = new Map(TOPICS.map((t, i) => [t.key, i]));
  return Array.from(counts, ([key, count]) => {
    const t = TOPIC_BY_KEY.get(key)!;
    return { key, label: t.label, title: t.title, count };
  }).sort((a, b) => b.count - a.count || (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/**
 * Topic keys for free context text (a video title, a category name, a
 * specialty slug or a topic key itself), for sponsored-offer matching.
 */
export function topicsForContext(value: string | null | undefined): TopicKey[] {
  if (!value) return [];
  if (isTopicKey(value)) return [value];
  const bySpecialty = topicsForSpecialty(value);
  if (bySpecialty.length) return bySpecialty;
  return classifyQuestion(value.replace(/-/g, ' ')).topics;
}
