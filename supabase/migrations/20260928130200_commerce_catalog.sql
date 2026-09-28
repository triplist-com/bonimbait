-- =============================================================================
-- Wave 2 · Community & Commerce: catalog columns + live-site seed.
--
-- Additive and idempotent (re-runnable). Safe to run before OR after the
-- Migration agent's product import: every insert is `on conflict do nothing`
-- and the extra columns are filled with coalesce/only-if-empty updates keyed
-- by legacy_wp_id, so import order does not matter.
--
--  1. product_categories.taxonomy — WooCommerce has two product taxonomies on
--     the live site: product_cat (/product-category/<slug>/, 1 term "כללי")
--     and the custom category_product (/category-product/<slug>/, 8
--     construction-stage terms). Neither is in the REST crawl's term list for
--     category_product, so those 8 terms + memberships are seeded here from
--     the live archive pages.
--  2. products: tag_label (the product_tag chip shown on cards), subtitle,
--     lead_heading, lead_urgent_option, details (accordion sections
--     "תנאים ומימוש" / "מידע חשוב נוסף" / "שאלות ותשובות").
--  3. service_plans: cta_label, compare_label; the 12-row comparison table
--     (features) and FAQ; is_purchasable_online = true for בונים תקציב only.
--  4. profiles.newsletter_opt_in (account area: "tips & updates" opt-in).
-- =============================================================================

-- 1. Taxonomy ----------------------------------------------------------------------
alter table public.product_categories
  add column if not exists taxonomy text not null default 'product_cat';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_categories_taxonomy_check') then
    alter table public.product_categories
      add constraint product_categories_taxonomy_check check (taxonomy in ('product_cat', 'category_product'));
  end if;
end $$;

create index if not exists product_categories_taxonomy_idx on public.product_categories (taxonomy, sort_order);

insert into public.product_categories (legacy_wp_id, slug, name, taxonomy, sort_order, seo_title) values
  (534, 'כללי',        'כללי',        'product_cat',      0, 'כללי Archives - בונים בית'),
  (296, 'שלב-רכישה',   'שלב רכישה',   'category_product', 1, 'ארכיון שלב רכישה - בונים בית'),
  (295, 'שלב-תכנון',   'שלב תכנון',   'category_product', 2, 'ארכיון שלב תכנון - בונים בית'),
  (294, 'שלב-היתר',    'שלב היתר',    'category_product', 3, 'ארכיון שלב היתר - בונים בית'),
  (293, 'שלב-שלד',     'שלב שלד',     'category_product', 4, 'ארכיון שלב שלד - בונים בית'),
  (292, 'שלב-תשתיות',  'שלב תשתיות',  'category_product', 5, 'ארכיון שלב תשתיות - בונים בית'),
  (291, 'שלב-גמרים',   'שלב גמרים',   'category_product', 6, 'ארכיון שלב גמרים - בונים בית'),
  (290, 'כניסה-לבית',  'כניסה לבית',  'category_product', 7, 'ארכיון כניסה לבית - בונים בית'),
  (289, 'שיפוצים',     'שיפוצים',     'category_product', 8, 'ארכיון שיפוצים - בונים בית')
on conflict do nothing;

-- The 8 stage terms are category_product even if another loader inserted them first.
update public.product_categories set taxonomy = 'category_product'
where legacy_wp_id between 289 and 296 and taxonomy <> 'category_product';

-- 2. Products ----------------------------------------------------------------------
alter table public.products add column if not exists tag_label text;
alter table public.products add column if not exists subtitle text;
alter table public.products add column if not exists lead_heading text;
alter table public.products add column if not exists lead_urgent_option boolean not null default false;
alter table public.products add column if not exists details jsonb not null default '[]'::jsonb;

comment on column public.products.details is
  'Accordion sections on the product page: [{"title": "...", "html": "..."}]';

insert into public.products
  (legacy_wp_id, slug, name, description_html, is_purchasable, price_agorot, featured_image, images, sort_order, seo_title, seo_description, status)
values
  (75114, $q$הנחה-בהצטרפות-לפזגז$q$, $q$הנחה של 150 ₪ בהצטרפות לפזגז$q$, $q$<p>חברי קהילת בונים בית 💙<br />במסגרת שיתוף פעולה מיוחד עם <strong>פזגז</strong>,<br />דאגנו לכם להטבה פשוטה ושווה כסף:</p>
<p><strong>הנחה חד־פעמית של 150 ₪</strong><br />ממחיר המחירון של פזגז<br />בהתקנת מערכת גז ביתית במיכלים.</p>
<p>בלי התחייבויות מיותרות,<br />ובלי קשר לרכישת מחמם מים או כל מוצר אחר.</p>$q$, false, 0, $q$https://bonimbayit.co.il/wp-content/uploads/2025/12/Gemini_Generated_Image_rrg9kmrrg9kmrrg9-scaled.jpg$q$, $q$[{"url": "https://bonimbayit.co.il/wp-content/uploads/2025/12/Gemini_Generated_Image_rrg9kmrrg9kmrrg9-scaled.jpg", "alt": "הנחה של 150 ₪ בהצטרפות לפזגז"}]$q$::jsonb, 1, $q$הנחה של 150 ₪ בהצטרפות לפזגז - בונים בית$q$, $q$חברי קהילת בונים בית 💙 במסגרת שיתוף פעולה מיוחד עם פזגז , דאגנו לכם להטבה פשוטה ושווה כסף: הנחה חד־פעמית של 150 ₪ ממחיר המחירון של פזגז בהתקנת מערכת גז ביתית במיכלים. בלי התחייבויות מיותרות, ובלי קשר לרכישת מחמם מים או כל מוצר אחר.$q$, 'published'),
  (73990, $q$מחמם-מים-בגז-מבית-פזגז-חינם$q$, $q$מחמם מים בגז מבית RINNAI – עם 8 מיכלי גז גדולים במתנה!$q$, $q$<p><strong>פרטי ההטבה</strong></p>
<p>✔️ 2 מיכלים גדולים לשנה<br />
✔️ למשך 4 שנים – סה״כ 8 מיכלים גדולים במתנה</p>
<p>המבצע אושר על ידי פזגז ומיועד ללקוחות חדשים המצטרפים לשירותי גז דרך בונים בית.</p>
<p>&nbsp;</p>
<p><strong>על מחמם המים &#8211; RINNAI יפן</strong><br />
<em>המחמם החסכוני והאמין שמוביל את השוק ביפן ובעולם.</em></p>
<p>✔️ <strong>מים חמים בלי הפסקה</strong> &#8211; טמפרטורה יציבה גם בהפעלת מספר ברזים במקביל.<br />
✔️ <strong>הפעלה מיידית</strong> &#8211; המחמם נכנס לפעולה רק כשהברז נפתח &#8211; בלי בזבוז אנרגיה.<br />
✔️ <strong>חסכוני בצריכת גז</strong> &#8211; מתממשק לדוד השמש ופועל רק כשצריך.<br />
✔️ <strong>עמידות מלאה</strong> &#8211; מיועד להתקנה חיצונית, עמיד לחום/קור, עומד בתקני בטיחות מחמירים.<br />
✔️<strong> בקרה חכמה</strong> &#8211; תצוגת LCD לשליטה, זיהוי אבנית, הגנות חימום, הצגת תקלות ועוד.<br />
✔️ <strong>מתאים לשימוש ביתי אינטנסיבי</strong> &#8211; עד 2 ברזים במקביל.</p>$q$, true, 360000, $q$https://bonimbayit.co.il/wp-content/uploads/2025/09/ChatGPT-Image-Mar-12-2026-12_44_50-PM.jpg$q$, $q$[{"url": "https://bonimbayit.co.il/wp-content/uploads/2025/09/ChatGPT-Image-Mar-12-2026-12_44_50-PM.jpg", "alt": "מחמם מים בגז מבית RINNAI – עם 8 מיכלי גז גדולים במתנה!"}]$q$::jsonb, 2, $q$מחמם מים בגז מבית RINNAI – עם 8 מיכלי גז גדולים במתנה! - בונים בית$q$, $q$פרטי ההטבה ✔️ 2 מיכלים גדולים לשנה ✔️ למשך 4 שנים – סה״כ 8 מיכלים גדולים במתנה המבצע אושר על ידי פזגז ומיועד ללקוחות חדשים המצטרפים לשירותי גז דרך בונים בית. על מחמם המים – RINNAI יפן המחמם החסכוני והאמין שמוביל את השוק ביפן ובעולם. ✔️ מים חמים בלי הפסקה – טמפרטורה יציבה גם בהפעלת מספר ברזים במקביל.$q$, 'published'),
  (63036, $q$ביטוח-בניה-כל-הסיכונים-אגם-פתרונות$q$, $q$ביטוח קבלנים לבונה הפרטי ולמשפץ$q$, $q$<h3>לא בונים לפני שמבטחים!</h3>
<p>ביטוח בניה לבונה הפרטי הינו כיסוי הכרחי וחשוב לאין ערוך! בניית בית ו/או שיפוץ כרוכים בסיכונים רבים. בתהליך הבנייה מעורבים מספר רב של אנשי מקצוע, ספקים ונותני שירות. פעמים רבות  מתמודד הבונה עם נזקים באתר הבנייה, פגיעות בגוף לצד שלישי ולעובדים באתר שמחייבים אותו להגן על עצמו ועל כספו. סוכנות אגם פתרונות מתמחה בתחום הבנייה. בשנים האחרונות טיפלנו במאות תביעות באמצעות הפוליסה הייחודית של בונים בית. הביטוח שאנו מציעים מספק פתרון מקצועי וייחודי עם יתרונות והרחבות משמעותיים ביחס לכלל הפוליסות הקיימות בשוק. הביטוח מותאם אישית לכל בונה על מנת לענות על צרכיו הייחודיים ולהקנות לו שקט נפשי מתחילת הבנייה .</p>
<p><strong>* חשוב מאוד לדעת! הבונה הפרטי הוא זה שמבצע את הביטוח &#8211; לא מסתמכים על הביטוח של הקבלן!</strong></p>
<p><strong>** נדרש  לבטח את הפרויקט לפני תחילת העבודות והכניסה לאתר!</strong></p>
<p><b>*** יש להפעיל ביטוח לפני התחלת שלד!</b></p>
<p>&nbsp;</p>$q$, false, 0, $q$https://bonimbayit.co.il/wp-content/uploads/2024/05/Gemini_Generated_Image_50d08f50d08f50d0.jpg$q$, $q$[{"url": "https://bonimbayit.co.il/wp-content/uploads/2024/05/Gemini_Generated_Image_50d08f50d08f50d0.jpg", "alt": "ביטוח קבלנים לבונה הפרטי ולמשפץ"}]$q$::jsonb, 3, $q$ביטוח קבלנים לבונה הפרטי ולמשפץ - בונים בית$q$, $q$לא בונים לפני שמבטחים! ביטוח בניה לבונה הפרטי הינו כיסוי הכרחי וחשוב לאין ערוך! בניית בית ו/או שיפוץ כרוכים בסיכונים רבים. בתהליך הבנייה מעורבים מספר רב של אנשי מקצוע, ספקים ונותני שירות. פעמים רבות מתמודד הבונה עם נזקים באתר הבנייה, פגיעות בגוף לצד שלישי ולעובדים באתר שמחייבים אותו להגן על עצמו ועל$q$, 'published')
on conflict do nothing;

update public.products set
  tag_label = coalesce(tag_label, $q$דוד שמש$q$),
  subtitle = coalesce(subtitle, $q$🎁 הנחה מיוחדת חד־פעמית של 150 ₪ למצטרפים חדשים$q$),
  lead_heading = coalesce(lead_heading, $q$מעוניינים במוצר? השאירו פרטים ונחזור אליכם$q$),
  lead_urgent_option = lead_urgent_option or false,
  details = case when details = '[]'::jsonb then $q$[{"title": "שאלות ותשובות", "html": "<h3>למי ההטבה מתאימה?</h3>\n<p>✔️ בונים בית פרטי<br/>✔️ משפצים<br/>✔️ בתים קיימים שטרם מחוברים לפזגז<br/>✔️ מי שמחפש חיבור לגז בצורה מסודרת, בטוחה ואמינה</p>\n<h3>למה פזגז?</h3>\n<p>✔️ מעל <strong>85 שנה</strong> של ניסיון בתחום האנרגיה<br/>✔️ יותר מ־<strong>2.5 מיליון לקוחות מרוצים</strong><br/>✔️ פריסה ארצית רחבה ומערך טכנאים מוסמכים<br/>✔️ שירות מקצועי, אמין וזמין</p>\n<h3>מה צריך לעשות?</h3>\n<p>השאירו פרטים בטופס, ונציגי פזגז ייצרו איתכם קשר לתיאום ההצטרפות ומימוש ההטבה.</p>"}]$q$::jsonb else details end
where legacy_wp_id = 75114;

update public.products set
  tag_label = coalesce(tag_label, $q$מערכות חימום מים$q$),
  subtitle = coalesce(subtitle, $q$רוכשים מחמם מים איכותי של RINNAI יפן (17 ליטר) בעלות של 3,600 ₪ ומקבלים 8 מיכלי גז גדולים במתנה$q$),
  lead_heading = coalesce(lead_heading, $q$מעוניינים במוצר? השאירו פרטים ונחזור אליכם$q$),
  lead_urgent_option = lead_urgent_option or true,
  details = case when details = '[]'::jsonb then $q$[{"title": "תנאים ומימוש", "html": "<ul>\n<li class=\"x_xmsonormal\" dir=\"RTL\">ההטבה מיועדת ללקוחות פרטיים-ביתיים חדשים בלבד, המצטרפים לשירותי פזגז דרך אתר \"בונים בית\".</li>\n<li class=\"x_xmsonormal\" dir=\"RTL\">ההנחה תינתן באופן חד-פעמי בעת ההתקנה הראשונית בלבד, ואינה ניתנת להמרה בכסף או בזיכוי מכל סוג.</li>\n<li class=\"x_xmsonormal\" dir=\"RTL\">מימוש ההטבה לחברי \"בונים בית\" בלבד ומותנה בהצגת הוכחת הצטרפות דרך אתר \"בונים בית\" ובכפוף לבדיקת זכאות מול פזגז.</li>\n<li class=\"x_xmsonormal\" dir=\"RTL\">אין כפל מבצעים, הנחות או הטבות אחרות של פזגז.</li>\n<li class=\"x_xmsonormal\" dir=\"RTL\">פזגז שומרת לעצמה את הזכות לשנות, לעדכן או להפסיק את תנאי ההטבה, כולם או חלקם, בכל עת וללא הודעה מוקדמת, לפי שיקול דעתה הבלעדי.</li>\n<li class=\"x_xmsonormal\" dir=\"RTL\">ט.ל.ח.</li>\n</ul>"}, {"title": "מידע חשוב נוסף", "html": "<ul>\n<li>לאחר הרכישה יצרו איתכם קשר מחברת פזגז לתיאום מימוש ההטבה והסדרת אספקת הגז</li>\n<li>התקנה אינה כלולה במחיר המכשיר. עלות התקנה: 790–1,190 ₪, לפי אזור ומורכבות.</li>\n<li><strong>השירות אינו זמין באזורים הבאים:</strong><br/>❌ פתח תקווה<br/>❌ ראש העין<br/>❌ אזור השומרון</li>\n</ul>"}, {"title": "שאלות ותשובות", "html": "<p><strong>למי זה מתאים?</strong></p>\n<p>✔️ <strong>בונים</strong> ומשפצים בשלב התכנון<br/>\n✔️ בתים קיימים המחוברים לכל חברת גז<br/>\n✔️ מי שמחפש מחמם מים חסכוני, איכותי ואמין<br/>\n✔️ מי שרוצה מים חמים בלי הפסקה ובלי בזבוז אנרגיה</p>"}]$q$::jsonb else details end
where legacy_wp_id = 73990;

update public.products set
  tag_label = coalesce(tag_label, $q$ביטוח קבלנים$q$),
  subtitle = coalesce(subtitle, null),
  lead_heading = coalesce(lead_heading, $q$מחפשים פוליסה שמתאימה בדיוק לכם? השאירו פרטים ונחזור אליכם$q$),
  lead_urgent_option = lead_urgent_option or false,
  details = case when details = '[]'::jsonb then $q$[{"title": "מידע חשוב נוסף", "html": "<p class=\"h-item\" data-id=\"1\" id=\"ht-1\">מה כולל ביטוח בניה פרטית?</p>\n<p class=\"h-item\" data-id=\"2\" id=\"ht-2\">מדוע חשוב לרכוש ביטוח בניה פרטית?</p>\n<p>איך לבחור ביטוח בנייה פרטית בצורה נכונה?</p>\n<p>מה העלות של ביטוח בניה פרטית?</p>\n<p><a href=\"/%d7%91%d7%99%d7%98%d7%95%d7%97-%d7%91%d7%a0%d7%99%d7%94-%d7%a4%d7%a8%d7%98%d7%99%d7%aa/\"> לחצו כאן &gt;&gt;</a></p>\n<p class=\"description\">\n</p>"}]$q$::jsonb else details end
where legacy_wp_id = 63036;


-- Category memberships (live archives, 2026-09-28): all 3 products are in
-- product_cat "כללי"; the 150 ₪ discount and the RINNAI heater are in all 8
-- stages; contractor insurance only in תכנון / היתר / שלד.
insert into public.product_category_assignments (product_id, category_id)
select p.id, c.id
from (values
  (75114, 534), (73990, 534), (63036, 534),
  (75114, 289), (75114, 290), (75114, 291), (75114, 292), (75114, 293), (75114, 294), (75114, 295), (75114, 296),
  (73990, 289), (73990, 290), (73990, 291), (73990, 292), (73990, 293), (73990, 294), (73990, 295), (73990, 296),
  (63036, 293), (63036, 294), (63036, 295)
) as v (product_wp_id, category_wp_id)
join public.products p on p.legacy_wp_id = v.product_wp_id
join public.product_categories c on c.legacy_wp_id = v.category_wp_id
on conflict do nothing;

-- 3. Service plans -------------------------------------------------------------------
alter table public.service_plans add column if not exists cta_label text;
alter table public.service_plans add column if not exists compare_label text;

update public.service_plans set cta_label = coalesce(cta_label, v.cta), compare_label = coalesce(compare_label, v.cmp)
from (values
  ('bonim-budget',       'קביעת פגישת תקציב', 'תוכנית הבסיס'),
  ('bonim-bait-plus',    'קביעת פגישת ייעוץ', 'התוכנית המורחבת'),
  ('bonim-bait-turnkey', 'קביעת פגישת התאמה', 'התוכנית המקיפה')
) as v (slug, cta, cmp)
where service_plans.slug = v.slug;

-- Owner decision (Wave 2 default): only בונים תקציב can be bought online.
update public.service_plans set is_purchasable_online = true
where slug = 'bonim-budget' and not is_purchasable_online;

-- Comparison table (12 rows, 3 categories) from the live /membership-tiers/.
-- value: true (included), false (not included) or text ("לבחירה" = optional).
update public.service_plans sp set features = v.features::jsonb
from (values
  ('bonim-budget', $j$[
    {"category": "תקציב בניה", "label": "תקציב בניה מקיף ומדויק", "value": true},
    {"category": "תקציב בניה", "label": "מערכת ניהול תקציב דיגיטלית", "value": true},
    {"category": "תקציב בניה", "label": "קיום ישיבות תקציב בכל שלב תכנוני", "value": true},
    {"category": "מכרז קבלנים", "label": "עריכת חוברת פרטים כולל כתב כמויות ומפרט טכני", "value": false},
    {"category": "מכרז קבלנים", "label": "ניהול מכרזים, מו״מ ועריכת חוזים ולוחות תשלומים", "value": false},
    {"category": "מכרז קבלנים", "label": "בקרה הנדסית במידול דו ותלת מימדי", "value": false},
    {"category": "מכרז קבלנים", "label": "ייעוץ הנדסי ותכנון מערכות", "value": false},
    {"category": "ניהול וביצוע", "label": "עריכת לוח פעילויות (גאנט)", "value": false},
    {"category": "ניהול וביצוע", "label": "ניהול ופיקוח בניה", "value": false},
    {"category": "ניהול וביצוע", "label": "חיבור למערכת Bonim.Os לשליטה מלאה", "value": false},
    {"category": "ניהול וביצוע", "label": "הצבת מצלמת אתר", "value": false},
    {"category": "ניהול וביצוע", "label": "מינוי אחראי לביצוע ביקורת", "value": false}
  ]$j$),
  ('bonim-bait-plus', $j$[
    {"category": "תקציב בניה", "label": "תקציב בניה מקיף ומדויק", "value": true},
    {"category": "תקציב בניה", "label": "מערכת ניהול תקציב דיגיטלית", "value": true},
    {"category": "תקציב בניה", "label": "קיום ישיבות תקציב בכל שלב תכנוני", "value": true},
    {"category": "מכרז קבלנים", "label": "עריכת חוברת פרטים כולל כתב כמויות ומפרט טכני", "value": "לבחירה"},
    {"category": "מכרז קבלנים", "label": "ניהול מכרזים, מו״מ ועריכת חוזים ולוחות תשלומים", "value": "לבחירה"},
    {"category": "מכרז קבלנים", "label": "בקרה הנדסית במידול דו ותלת מימדי", "value": "לבחירה"},
    {"category": "מכרז קבלנים", "label": "ייעוץ הנדסי ותכנון מערכות", "value": "לבחירה"},
    {"category": "ניהול וביצוע", "label": "עריכת לוח פעילויות (גאנט)", "value": false},
    {"category": "ניהול וביצוע", "label": "ניהול ופיקוח בניה", "value": false},
    {"category": "ניהול וביצוע", "label": "חיבור למערכת Bonim.Os לשליטה מלאה", "value": false},
    {"category": "ניהול וביצוע", "label": "הצבת מצלמת אתר", "value": false},
    {"category": "ניהול וביצוע", "label": "מינוי אחראי לביצוע ביקורת", "value": false}
  ]$j$),
  ('bonim-bait-turnkey', $j$[
    {"category": "תקציב בניה", "label": "תקציב בניה מקיף ומדויק", "value": true},
    {"category": "תקציב בניה", "label": "מערכת ניהול תקציב דיגיטלית", "value": true},
    {"category": "תקציב בניה", "label": "קיום ישיבות תקציב בכל שלב תכנוני", "value": true},
    {"category": "מכרז קבלנים", "label": "עריכת חוברת פרטים כולל כתב כמויות ומפרט טכני", "value": true},
    {"category": "מכרז קבלנים", "label": "ניהול מכרזים, מו״מ ועריכת חוזים ולוחות תשלומים", "value": true},
    {"category": "מכרז קבלנים", "label": "בקרה הנדסית במידול דו ותלת מימדי", "value": true},
    {"category": "מכרז קבלנים", "label": "ייעוץ הנדסי ותכנון מערכות", "value": true},
    {"category": "ניהול וביצוע", "label": "עריכת לוח פעילויות (גאנט)", "value": true},
    {"category": "ניהול וביצוע", "label": "ניהול ופיקוח בניה", "value": true},
    {"category": "ניהול וביצוע", "label": "חיבור למערכת Bonim.Os לשליטה מלאה", "value": true},
    {"category": "ניהול וביצוע", "label": "הצבת מצלמת אתר", "value": true},
    {"category": "ניהול וביצוע", "label": "מינוי אחראי לביצוע ביקורת", "value": true}
  ]$j$)
) as v (slug, features)
where sp.slug = v.slug and sp.features = '[]'::jsonb;

-- 4. Profiles: newsletter / tips opt-in (account area) -----------------------------
alter table public.profiles add column if not exists newsletter_opt_in boolean not null default false;
