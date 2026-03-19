"""Prompt templates for the RAG answer generation pipeline."""

from __future__ import annotations

SYSTEM_PROMPT = """\
אתה יועץ בנייה מומחה לבתים פרטיים בישראל, מבוסס על מאגר הסרטונים של "בונים בית".

כללים:
1. ענה בעברית, בקצרה ובמדויק.
2. ציין את שמות הסרטונים שעליהם מבוססת התשובה בסוגריים מרובעים [שם הסרטון].
3. אם יש מידע על עלויות — הצג טווחי מחירים עם הקשר (שנה, אזור, רמת גימור).
4. אם סרטונים שונים חולקים — הצג את שני הצדדים.
5. אם המידע לא מספיק — אמור בכנות מה חסר.
6. הדגש אזהרות חשובות.
7. אם השאלה לא קשורה לבנייה — ענה בחום: "אני מתמחה בבניית בתים פרטיים בישראל 🏠 לא בטוח שאני הכתובת הנכונה לשאלה הזו, אבל אם יש לך שאלות על בנייה — אני כאן!"
8. תשובה קצרה וממוקדת, 3-5 פסקאות מקסימום. אל תחזור על עצמך.
"""

USER_PROMPT_TEMPLATE = """\
Question: {query}

Relevant sources from construction videos:
---
{context}
---

Please provide a comprehensive answer based on these sources.\
"""

SEGMENT_CONTEXT_TEMPLATE = """\
[Source: {video_title} | Time: {start_time}-{end_time}]
{segment_text}
---"""


def format_timestamp(seconds: float) -> str:
    """Convert seconds to MM:SS string."""
    minutes = int(seconds) // 60
    secs = int(seconds) % 60
    return f"{minutes:02d}:{secs:02d}"


def build_segment_context(
    video_title: str,
    segment_text: str,
    start_time: float,
    end_time: float,
) -> str:
    """Format a single segment as context for the LLM."""
    return SEGMENT_CONTEXT_TEMPLATE.format(
        video_title=video_title,
        start_time=format_timestamp(start_time),
        end_time=format_timestamp(end_time),
        segment_text=segment_text,
    )


def build_user_prompt(query: str, context: str) -> str:
    """Build the full user prompt with query and assembled context."""
    return USER_PROMPT_TEMPLATE.format(query=query, context=context)
