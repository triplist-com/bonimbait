-- =============================================================================
-- Growth (P6): the budget planner's price book ("תקציב ראשוני ב-3 דקות")
--
--   planner_price_book   append-only versions of every number the planner uses
--                        (apps/web/lib/planner/types.ts PriceBook; money in agorot)
--
-- * The newest row is the current price book (apps/web/lib/planner/price-book.ts).
--   Every admin save (/admin/planner/) inserts a new version. Nothing is updated
--   or deleted, so the table is its own audit trail and any version can be
--   restored by saving it again.
-- * RLS: anyone may read (the numbers are public on the site); staff (editor,
--   admin) may insert, as themselves. No update or delete for anyone but the
--   service role.
-- * Seed: the owner's 2026 figures, identical to
--   apps/web/lib/planner/price-book.seed.json (tests/planner/price-book.test.ts
--   checks it). Inserted only when the table is empty, so re-running never
--   duplicates the seed or overrides an admin edit.
-- * Idempotent: if not exists / drop ... if exists / where not exists.
-- =============================================================================

create table if not exists public.planner_price_book (
  id          uuid        primary key default gen_random_uuid(),
  valid_as_of date        not null,
  data        jsonb       not null,
  note        text,
  created_by  uuid        default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint planner_price_book_data_object check (jsonb_typeof(data) = 'object' and data ->> 'version' = '1'),
  constraint planner_price_book_note_length check (note is null or char_length(note) <= 500),
  constraint planner_price_book_valid_as_of check (data ->> 'validAsOf' = to_char(valid_as_of, 'YYYY-MM-DD'))
);

comment on table public.planner_price_book is
  'Budget planner price book versions (apps/web lib/planner). Newest row = current. Append-only.';

create index if not exists planner_price_book_created_at_idx on public.planner_price_book (created_at desc);

alter table public.planner_price_book enable row level security;

drop policy if exists "public read" on public.planner_price_book;
create policy "public read" on public.planner_price_book
  for select
  using (true);

drop policy if exists "staff insert" on public.planner_price_book;
create policy "staff insert" on public.planner_price_book
  for insert
  to authenticated
  with check ((select public.is_staff()) and (created_by is null or created_by = (select auth.uid())));

revoke all on table public.planner_price_book from anon, authenticated;
grant select on table public.planner_price_book to anon, authenticated;
grant insert on table public.planner_price_book to authenticated;
grant all on table public.planner_price_book to service_role;

-- Seed: the owner's 2026 numbers (articles of 25-26.6.2026, podcast episodes 107 and 109).
insert into public.planner_price_book (valid_as_of, data, note, created_by)
select
  date '2026-07-16',
  $seed${
  "version": 1,
  "validAsOf": "2026-07-16",
  "rangePct": 15,
  "vatRatePct": 18,
  "finishLevels": {
    "basic": {
      "perM2Agorot": 1100000,
      "note": "בית פשוט יחסית: כ-10 אלף ₪ למ״ר (מאמר 'כמה עולה לבנות בית פרטי ב-2026', 26.6.2026). נקודת אמצע: 11 אלף."
    },
    "standard": {
      "perM2Agorot": 1300000,
      "note": "העוגן של בונים בית: 12–14 אלף ₪ למ״ר לתכנון ובנייה, לפני מע״מ (מאמר 26.6.2026); 'סביב ה-13,000 למטר הבנייה ותכנון' (פרק 107, 13:40)."
    },
    "high": {
      "perM2Agorot": 1550000,
      "note": "בין העוגן (12–14 אלף) לבתים מורכבים ויוקרתיים (18 אלף). הנחת עבודה של המחשבון."
    },
    "luxury": {
      "perM2Agorot": 1800000,
      "note": "'בבתים יוקרתיים העלות יכולה להגיע גם ל-18K ₪/מ״ר ואף יותר' (מאמר 26.6.2026)."
    }
  },
  "regionFactors": {
    "golan": 1,
    "upper-galilee": 1,
    "akko-nahariya": 1,
    "lower-galilee": 1,
    "haifa-krayot": 1,
    "zichron-valleys": 1,
    "hadera": 1,
    "sharon": 1,
    "center": 1,
    "shfela": 1,
    "jerusalem": 1,
    "judea-samaria": 1,
    "south": 1.05
  },
  "regionNotes": {
    "south": "בדרום המחירים היום גבוהים יותר מבשרון, בגלל מצוקת כוח אדם מאז המלחמה (פרק 107, 13:27)."
  },
  "floorShellFactors": {
    "1": 1.2,
    "2": 1,
    "3": 0.93
  },
  "stageSplitPct": {
    "purchase": 0,
    "planning": 6,
    "permit": 4,
    "frame": 31,
    "infrastructure": 15,
    "finishing": 44,
    "moving-in": 0
  },
  "extras": {
    "basement": {
      "amountAgorot": 75000000,
      "stage": "frame",
      "enabled": true,
      "note": "תוספת מרתף: 700–800 אלף ₪ (מאמר 26.6.2026; פרק 107)."
    },
    "pool": {
      "amountAgorot": 20000000,
      "stage": "finishing",
      "enabled": true,
      "note": "בריכת סקימר פרטית (40–50 מ״ר): 150–250 אלף ₪ (מאמר 'בריכת גלישה מול בריכת סקימר', 31.5.2026)."
    },
    "slope": {
      "amountAgorot": 22500000,
      "stage": "frame",
      "enabled": true,
      "note": "חומות, משטחי חוץ ומילוי אדמה: עוד 200–250 אלף ₪ (מאמר 'עלויות ביצוע בית פרטי 2026'; פרק 109, 26:27)."
    },
    "vrf": {
      "amountAgorot": 8000000,
      "stage": "infrastructure",
      "enabled": true,
      "note": "VRF או מזגנים נסתרים 120–170 אלף מול מיני מרכזי 60–70 אלף (מאמר 'עלויות ביצוע בית פרטי 2026'). כאן רק ההפרש; גבס והנמכות מתייקרים בנפרד."
    },
    "smart_home": {
      "amountAgorot": 3500000,
      "stage": "infrastructure",
      "enabled": true,
      "note": "רוב הבתים בישראל: 20–50 אלף ₪ (מאמר 'בית חכם לבית פרטי 2026', 22.6.2026)."
    }
  },
  "movingInPerM2Agorot": {
    "min": 50000,
    "max": 150000,
    "note": "'לפחות 500 ש״ח למטר זה אכלוס… 1,000–1,500 ש״ח למטר זה לא מופרח' (פרק 107, 12:07). לא כלול בסכום."
  },
  "contingencyPct": {
    "withBudget": [
      5,
      7
    ],
    "withoutBudget": [
      15,
      20
    ],
    "note": "'כשעובדים מסודר מול תקציב שנערך בצורה מקצועית – 5–7 אחוז' (פרק 107, 9:10); בלי תקציב מסודר 15–20% (מאמר 26.6.2026)."
  },
  "timelineMonths": {
    "purchase": [
      0,
      0
    ],
    "planning": [
      6,
      9
    ],
    "permit": [
      3,
      6
    ],
    "frame": [
      4,
      5
    ],
    "infrastructure": [
      2,
      3
    ],
    "finishing": [
      6,
      7
    ],
    "moving-in": [
      0,
      0
    ]
  },
  "notes": {
    "floors": "מטר קבלני לבית של 300 מ״ר: קומה אחת 450, שתי קומות 375, שלוש קומות 350 (מאמר 'מה משפיע על עלויות הבנייה?', 10.7.2026). המקדם חל על שלב השלד בלבד.",
    "split": "לבית של 200 מ״ר ב-13 אלף ₪ למ״ר (2.6 מיליון): תכנון ואגרות כ-250 אלף (כ-10%), שלד כ-800 אלף (פרק 109, 28:34), והיתרה בתשתיות ובגמרים לפי סעיפי הביצוע במאמר 'עלויות ביצוע בית פרטי 2026'. ניהול ופיקוח (150–180 אלף) מפוזרים על שלבי הביצוע.",
    "timeline": "תכנון והיתר: 'סדר גודל של שנה, יכול גם שלוש' (מאמר 26.6.2026). מהיתר ועד מפתח כ-14 חודשים בניהול טוב: שלד 4–5, מערכות 2–3, גמרים 4–5 וגמרים עדינים 2 (מאמר 'פיקוח בניה וניהול פרויקטים', 23.7.2026). בלי פיקוח ראינו גם 24 חודשים.",
    "regions": "אין בתוכן של בונים בית מקדם מספרי לכל אזור; הטווח של ±15% מכסה את השונות. בדרום תוספת של 5% (הנחת עבודה) לפי 'בדרום היום… המחירים גבוהים יותר מאשר בשרון' (פרק 107, 13:27)."
  },
  "sources": [
    {
      "id": "article-cost-2026",
      "kind": "article",
      "title": "כמה עולה לבנות בית פרטי ב-2026? תכנון, שלד, גמרים ומה לא כלול",
      "date": "2026-06-26",
      "href": "/cost-build-private-house-2026/",
      "quote": "12,000–14,000 ₪ למ״ר לתכנון ובנייה, לפני מע״מ",
      "primary": true
    },
    {
      "id": "podcast-107",
      "kind": "podcast",
      "title": "פודקאסט פרק 107 – מדברים על עלויות בניה לשנת 2026, פרק 1",
      "date": "2026-02-19",
      "href": "/video/X78Yo_sJgIM/?t=820",
      "youtubeId": "X78Yo_sJgIM",
      "startSec": 820,
      "quote": "סביב ה-13,000 למטר הבנייה ותכנון",
      "primary": true
    },
    {
      "id": "podcast-109",
      "kind": "podcast",
      "title": "פודקאסט פרק 109 – עלויות בניה בשנת 2026 – איך כל העלויות מורכבות?",
      "date": "2026-07-16",
      "href": "/video/vluNH7GTkU4/?t=1714",
      "youtubeId": "vluNH7GTkU4",
      "startSec": 1714,
      "quote": "השלדים נמצאים באזור של 800,000 ש״ח בממוצע",
      "primary": true
    },
    {
      "id": "article-execution-2026",
      "kind": "article",
      "title": "עלויות ביצוע בית פרטי 2026: שלד, טיח, ריצוף, אלומיניום ומיזוג",
      "date": "2026-06-25",
      "href": "/private-home-construction-costs-2026/",
      "quote": "שלד כ-35% מתקציב הביצוע, כ-800 אלף ₪ לבית של 200 מ״ר",
      "primary": true
    },
    {
      "id": "article-factors",
      "kind": "article",
      "title": "מה משפיע על עלויות הבנייה? מטר קבלן, חומרים ועבודה",
      "date": "2026-07-10",
      "href": "/factors-affecting-construction-costs/"
    },
    {
      "id": "article-supervision",
      "kind": "article",
      "title": "פיקוח בניה וניהול פרויקטים – המדריך המלא לבחירת מפקח, תשלומים ומניעת קומבינות",
      "date": "2026-07-23",
      "href": "/construction-supervision-project-management-guide/"
    },
    {
      "id": "article-pool",
      "kind": "article",
      "title": "בריכת גלישה מול בריכת סקימר – מה ההבדל, כמה זה עולה ומה עדיף",
      "date": "2026-05-31",
      "href": "/overflow-vs-skimmer-pool-guide/"
    },
    {
      "id": "article-smart-home",
      "kind": "article",
      "title": "בית חכם לבית פרטי 2026: כמה עולה, מה באמת צריך ומה להכין בשלד",
      "date": "2026-06-22",
      "href": "/smart-home-costs-requirements-2026/"
    }
  ]
}$seed$::jsonb,
  'מחירון פתיחה: הנתונים של בונים בית ל-2026',
  null
where not exists (select 1 from public.planner_price_book);
