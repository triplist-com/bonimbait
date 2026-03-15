"""
Prompt templates for Claude API summarization and categorization.

All prompts instruct Claude in English but expect Hebrew input/output.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Category taxonomy
# ---------------------------------------------------------------------------
CATEGORIES = [
    {"slug": "planning-permits", "name_he": "תכנון ורישוי", "description_he": "תכנון אדריכלי, היתרי בנייה, תב\"ע, הגשת תוכניות"},
    {"slug": "costs-prices", "name_he": "עלויות ומחירים", "description_he": "עלויות בנייה, מחירי חומרים, הצעות מחיר, תקציב"},
    {"slug": "structure-construction", "name_he": "שלד ובנייה", "description_he": "יסודות, עמודים, קורות, תקרות, קירות, בטון"},
    {"slug": "electrical-plumbing", "name_he": "חשמל ואינסטלציה", "description_he": "מערכות חשמל, אינסטלציה, ביוב, מים, גז"},
    {"slug": "finishes-design", "name_he": "גמרים ועיצוב", "description_he": "ריצוף, חיפוי, צבע, דלתות, חלונות, עיצוב פנים"},
    {"slug": "contractors-labor", "name_he": "קבלנים ועבודה", "description_he": "בחירת קבלן, חוזים, פיקוח, ניהול עבודה"},
    {"slug": "laws-regulations", "name_he": "חוקים ותקנות", "description_he": "תקני בנייה, חוקי תכנון, רגולציה, ביטוח"},
    {"slug": "general-tips", "name_he": "טיפים כלליים", "description_he": "טיפים כלליים לבונים, טעויות נפוצות, המלצות"},
    {"slug": "insulation-waterproofing", "name_he": "בידוד ואיטום", "description_he": "בידוד תרמי, איטום, מניעת רטיבות, בידוד אקוסטי"},
    {"slug": "landscaping-yard", "name_he": "גינון וחצר", "description_he": "עבודות חוץ, גינון, גדרות, ריצוף חוץ, בריכה"},
]

VALID_CATEGORY_SLUGS = {c["slug"] for c in CATEGORIES}

DIFFICULTY_LEVELS = {"beginner", "intermediate", "advanced"}

# ---------------------------------------------------------------------------
# Helper: category taxonomy as formatted string for prompts
# ---------------------------------------------------------------------------
def _format_categories() -> str:
    lines = []
    for cat in CATEGORIES:
        lines.append(f'  - slug: "{cat["slug"]}" | {cat["name_he"]} — {cat["description_he"]}')
    return "\n".join(lines)


CATEGORY_BLOCK = _format_categories()

# ---------------------------------------------------------------------------
# Video summary prompt
# ---------------------------------------------------------------------------
VIDEO_SUMMARY_SYSTEM_PROMPT = f"""\
You are an expert in private home construction in Israel. You analyze Hebrew video \
transcripts from a popular Israeli construction YouTube channel and extract structured information.

Your task: read the full Hebrew transcript and produce a structured JSON response.

## Category Taxonomy
{CATEGORY_BLOCK}

## Output JSON Schema
Return ONLY valid JSON (no markdown fences, no commentary) with these fields:

{{
  "title_summary": "<string: clear, concise Hebrew title/summary in 1-2 sentences>",
  "key_points": ["<string>", ...],  // 3-8 key takeaways in Hebrew
  "costs": [
    {{
      "item": "<string: what is being priced, in Hebrew>",
      "price": "<string: the price/cost mentioned, e.g. '50,000 ש\"ח'>",
      "unit": "<string: per what — e.g. 'למ\"ר', 'ליחידה', 'לפרויקט'>",
      "context": "<string: brief context in Hebrew>",
      "approximate": <bool: true if the price is approximate/estimated>
    }}, ...
  ],  // empty list if no costs mentioned
  "rules": ["<string>", ...],  // construction rules/regulations/requirements in Hebrew; empty list if none
  "tips": ["<string>", ...],  // practical tips and recommendations in Hebrew; empty list if none
  "materials": ["<string>", ...],  // materials/products mentioned in Hebrew; empty list if none
  "warnings": ["<string>", ...],  // warnings, mistakes to avoid in Hebrew; empty list if none
  "category_slug": "<string: best matching slug from taxonomy>",
  "secondary_categories": ["<string>", ...],  // 0-2 other relevant slugs
  "difficulty_level": "<string: 'beginner' | 'intermediate' | 'advanced'>",
  "estimated_relevance_year": <int or null>  // if prices/info is time-sensitive, the year it's most relevant to; null otherwise
}}

## Rules
- All Hebrew text fields must be in Hebrew.
- key_points must have between 3 and 8 items.
- secondary_categories must have 0-2 items and must not include the primary category_slug.
- costs array: only include if specific prices/costs are mentioned. Each cost must have all fields.
- If the transcript is mostly filler or off-topic, still do your best to extract what you can.
- Return ONLY the JSON object. No explanation, no markdown code fences.\
"""

VIDEO_SUMMARY_USER_PROMPT = """\
Analyze the following Hebrew transcript from a construction video and extract structured information.

Transcript:
{transcript_text}\
"""

# ---------------------------------------------------------------------------
# Segment summary prompt (shorter, for individual segments)
# ---------------------------------------------------------------------------
SEGMENT_SUMMARY_SYSTEM_PROMPT = """\
You are an expert in Israeli home construction. Summarize the given Hebrew transcript segment \
in 1-2 concise sentences in Hebrew. Return ONLY the summary text, no JSON, no formatting.\
"""

SEGMENT_SUMMARY_USER_PROMPT = """\
Summarize this segment in 1-2 sentences in Hebrew:

{segment_text}\
"""

# ---------------------------------------------------------------------------
# Category classification prompt (lightweight, for re-categorization)
# ---------------------------------------------------------------------------
CATEGORY_CLASSIFICATION_SYSTEM_PROMPT = f"""\
You are a classifier for Israeli home construction videos. Given a video title/summary and key points, \
assign the best matching category and 0-2 secondary categories.

## Category Taxonomy
{CATEGORY_BLOCK}

Return ONLY valid JSON:
{{
  "category_slug": "<primary slug>",
  "secondary_categories": ["<slug>", ...]
}}

No explanation, no markdown fences.\
"""

CATEGORY_CLASSIFICATION_USER_PROMPT = """\
Classify this video:

Title/Summary: {title_summary}

Key Points:
{key_points}\
"""

# ---------------------------------------------------------------------------
# JSON repair prompt
# ---------------------------------------------------------------------------
JSON_REPAIR_SYSTEM_PROMPT = """\
You are a JSON repair assistant. The user will provide malformed JSON output. \
Fix it so it is valid JSON and return ONLY the corrected JSON. Do not add explanations or markdown fences.\
"""

JSON_REPAIR_USER_PROMPT = """\
The following JSON is malformed. Fix it and return only valid JSON:

{broken_json}\
"""

# ---------------------------------------------------------------------------
# HAIKU-optimized prompts (concise — Haiku works better with shorter prompts)
# ---------------------------------------------------------------------------

_COMPACT_CATEGORY_BLOCK = ", ".join(f'"{c["slug"]}"' for c in CATEGORIES)

HAIKU_VIDEO_SUMMARY_SYSTEM_PROMPT = f"""\
Extract structured info from a Hebrew construction video transcript. Return ONLY valid JSON.

Categories: {_COMPACT_CATEGORY_BLOCK}

JSON schema:
{{
  "title_summary": "Hebrew 1-2 sentence summary",
  "key_points": ["3-8 Hebrew takeaways"],
  "costs": [{{"item":"Hebrew","price":"e.g. 50,000 ש\\"ח","unit":"e.g. למ\\"ר","context":"Hebrew","approximate":bool}}],
  "rules": ["Hebrew construction rules, empty if none"],
  "tips": ["Hebrew practical tips, empty if none"],
  "materials": ["Hebrew materials mentioned, empty if none"],
  "warnings": ["Hebrew warnings, empty if none"],
  "category_slug": "best slug",
  "secondary_categories": ["0-2 other slugs"],
  "difficulty_level": "beginner|intermediate|advanced",
  "estimated_relevance_year": int_or_null
}}

Rules: Hebrew output. 3-8 key_points. Costs only if prices mentioned. No markdown fences.\
"""

HAIKU_VIDEO_SUMMARY_USER_PROMPT = """\
Analyze this Hebrew construction transcript:

{transcript_text}\
"""

HAIKU_JSON_REPAIR_SYSTEM_PROMPT = """\
Fix the malformed JSON below. Return ONLY valid JSON, nothing else.\
"""


# ---------------------------------------------------------------------------
# get_prompts() — select prompts based on model
# ---------------------------------------------------------------------------
def get_prompts(model: str) -> dict[str, str]:
    """
    Return the appropriate prompt set for the given model name.

    Returns dict with keys:
        system, user, json_repair_system, json_repair_user
    """
    if "haiku" in model.lower():
        return {
            "system": HAIKU_VIDEO_SUMMARY_SYSTEM_PROMPT,
            "user": HAIKU_VIDEO_SUMMARY_USER_PROMPT,
            "json_repair_system": HAIKU_JSON_REPAIR_SYSTEM_PROMPT,
            "json_repair_user": JSON_REPAIR_USER_PROMPT,
        }
    else:
        return {
            "system": VIDEO_SUMMARY_SYSTEM_PROMPT,
            "user": VIDEO_SUMMARY_USER_PROMPT,
            "json_repair_system": JSON_REPAIR_SYSTEM_PROMPT,
            "json_repair_user": JSON_REPAIR_USER_PROMPT,
        }
