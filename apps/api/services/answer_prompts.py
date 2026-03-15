"""Prompt templates for the RAG answer generation pipeline."""

from __future__ import annotations

SYSTEM_PROMPT = """\
You are a knowledgeable construction advisor for people building private homes in Israel.
You answer questions based ONLY on the provided video transcripts from the "בונים בית" knowledge base.

Rules:
1. Answer in Hebrew.
2. Be specific and practical.
3. Always cite your sources using the format: [שם הסרטון, דקה:שנייה].
4. If the sources don't contain enough information to answer, say so honestly.
5. When mentioning costs or prices, note the year or context they were mentioned in.
6. Structure your answer with clear paragraphs.
7. If there are conflicting opinions in different videos, present both perspectives.
8. Highlight any warnings or important cautions.
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
