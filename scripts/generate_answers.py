"""Generate 200 pre-computed answers for common construction questions.

Usage:
    python scripts/generate_answers.py

Costs ~$3-4 total (Haiku for questions, Sonnet for answers, OpenAI for embeddings).
"""

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime

import asyncpg
import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv(
    "SUPABASE_POOLER_URL",
    "postgresql://postgres.nfbasjadvakbsusupcoy:IdyiIEdiJwG1rNu9@aws-1-eu-north-1.pooler.supabase.com:6543/postgres",
)
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")

HAIKU_MODEL = "claude-haiku-4-5"
SONNET_MODEL = "claude-sonnet-4-6"
EMBEDDING_MODEL = "text-embedding-3-small"

TARGET_QUESTIONS = 200
BATCH_SIZE = 20  # answers per batch


# ---------------------------------------------------------------------------
# Step 1: Fetch video data
# ---------------------------------------------------------------------------

async def fetch_videos(conn) -> list[dict]:
    rows = await conn.fetch("""
        SELECT v.id, v.youtube_id, v.title, v.summary, v.key_points, v.costs_data,
               c.slug AS category_slug, c.name_he AS category_name
        FROM videos v
        LEFT JOIN categories c ON c.id = v.category_id
        ORDER BY v.published_at DESC
    """)
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Step 2: Generate candidate questions with Haiku
# ---------------------------------------------------------------------------

async def generate_questions(videos: list[dict], client: httpx.AsyncClient) -> list[dict]:
    """Ask Haiku to generate 250 candidate questions based on video content."""

    # Build compact video catalog — keep it short to stay within context
    catalog_lines = []
    for v in videos:
        line = f"- {v['title']}"
        if v.get('category_name'):
            line += f" [{v['category_name']}]"
        if v.get('costs_data') and isinstance(v['costs_data'], list) and len(v['costs_data']) > 0:
            line += " [עלויות]"
        catalog_lines.append(line)

    catalog = "\n".join(catalog_lines)

    prompt = f"""אתה מומחה בבניית בתים פרטיים בישראל. יש לך מאגר של {len(videos)} סרטונים על בנייה.

הנה רשימת הסרטונים:
{catalog}

צור רשימה של 200 שאלות שאנשים שבונים בית פרטי בישראל הכי סביר שישאלו. חשוב: כל שאלה קצרה, 3-8 מילים מקסימום.

כללים:
1. שאלות בעברית, כמו שאדם אמיתי היה מקליד בחיפוש
2. כלול שאלות על עלויות, מחירים, טווחי מחירים
3. כלול שאלות "איך", "מה", "כמה", "למה", "מתי"
4. כלול שאלות על כל הקטגוריות: שלד, גמר, חשמל, אינסטלציה, גג, ביסוס, רישוי, קבלנים
5. כלול שאלות קצרות (3-5 מילים) וגם ארוכות יותר (שאלה שלמה)
6. כלול שאלות על החלטות (בלוקים או בטון? טיח או שפכטל?)
7. כלול שאלות על טעויות נפוצות ואזהרות

החזר JSON array בלבד, בלי markdown, בלי הסברים:
[{{"question": "...", "category_slug": "..."}}]

הקטגוריות האפשריות: planning, structure, finishes, electrical, contractors, costs, tips, insulation, yard"""

    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": HAIKU_MODEL,
            "max_tokens": 16384,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=180.0,
    )
    if resp.status_code != 200:
        print(f"  ERROR {resp.status_code}: {resp.text[:500]}")
        resp.raise_for_status()
    data = resp.json()
    text = data["content"][0]["text"]

    tokens_in = data["usage"]["input_tokens"]
    tokens_out = data["usage"]["output_tokens"]
    print(f"  Question generation: {tokens_in} in / {tokens_out} out tokens")

    # Parse JSON from response — with repair for common issues
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        print("ERROR: Could not find JSON array in response")
        print(text[:500])
        return []

    raw_json = text[start:end]
    try:
        questions = json.loads(raw_json)
    except json.JSONDecodeError:
        # Try to repair: remove trailing commas, fix quotes
        import re
        repaired = re.sub(r',\s*([}\]])', r'\1', raw_json)  # trailing commas
        repaired = repaired.replace('"\n"', '",\n"')  # missing commas between items
        try:
            questions = json.loads(repaired)
        except json.JSONDecodeError:
            # Last resort: extract individual objects
            print("  WARNING: JSON repair failed, extracting objects individually")
            questions = []
            for m in re.finditer(r'\{[^{}]+\}', raw_json):
                try:
                    obj = json.loads(m.group())
                    if "question" in obj:
                        questions.append(obj)
                except json.JSONDecodeError:
                    continue
            print(f"  Extracted {len(questions)} questions via regex")
    print(f"  Generated {len(questions)} candidate questions")

    # Deduplicate by taking first TARGET_QUESTIONS unique questions
    seen = set()
    unique = []
    for q in questions:
        normalized = q["question"].strip()
        if normalized not in seen and len(normalized) > 5:
            seen.add(normalized)
            unique.append(q)
            if len(unique) >= TARGET_QUESTIONS:
                break

    print(f"  After dedup: {len(unique)} unique questions")
    return unique


# ---------------------------------------------------------------------------
# Step 3: Generate answers with Sonnet
# ---------------------------------------------------------------------------

async def generate_answer(
    question: str,
    category_slug: str | None,
    videos: list[dict],
    client: httpx.AsyncClient,
) -> dict:
    """Generate a structured answer for a single question."""

    # Find relevant videos (by category or keyword matching)
    relevant = []
    q_lower = question.lower()
    q_words = set(q_lower.split())

    for v in videos:
        score = 0
        title_lower = (v.get("title") or "").lower()
        summary_lower = (v.get("summary") or "").lower()

        # Category match
        if category_slug and v.get("category_slug") == category_slug:
            score += 2

        # Word overlap
        for word in q_words:
            if len(word) > 2:
                if word in title_lower:
                    score += 3
                if word in summary_lower:
                    score += 1

        if score > 0:
            relevant.append((score, v))

    relevant.sort(key=lambda x: x[0], reverse=True)
    top_videos = [v for _, v in relevant[:8]]

    if not top_videos:
        # Fallback: use category videos or first 5
        if category_slug:
            top_videos = [v for v in videos if v.get("category_slug") == category_slug][:5]
        if not top_videos:
            top_videos = videos[:5]

    # Build context
    context_parts = []
    for v in top_videos:
        part = f"[{v['title']}]"
        if v.get("summary"):
            part += f"\n{v['summary']}"
        if v.get("key_points") and isinstance(v["key_points"], list):
            kps = v["key_points"][:5]
            kp_texts = []
            for kp in kps:
                if isinstance(kp, str):
                    kp_texts.append(f"- {kp}")
                elif isinstance(kp, dict):
                    kp_texts.append(f"- {kp.get('text', '')}")
            if kp_texts:
                part += "\n" + "\n".join(kp_texts)
        if v.get("costs_data") and isinstance(v["costs_data"], list):
            for c in v["costs_data"][:3]:
                if isinstance(c, dict):
                    item = c.get("item", c.get("description", ""))
                    price = c.get("price", c.get("amount", ""))
                    unit = c.get("unit", "")
                    part += f"\n- עלות: {item}: {price} {unit}"
        context_parts.append(part)

    context = "\n---\n".join(context_parts)

    prompt = f"""שאלה: {question}

מידע מסרטונים:
{context}

ענה בעברית. החזר JSON בפורמט:
{{
  "answer": "תשובה קצרה וממוקדת (3-5 פסקאות מקסימום)",
  "key_points": ["נקודה 1", "נקודה 2", ...],
  "costs": [{{"item": "פריט", "price": "טווח מחירים", "unit": "יחידה"}}] או [],
  "tips": ["טיפ 1", "טיפ 2"] או [],
  "warnings": ["אזהרה 1"] או []
}}"""

    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": SONNET_MODEL,
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["content"][0]["text"]

    # Parse JSON
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        result = json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        result = {"answer": text, "key_points": [], "costs": [], "tips": [], "warnings": []}

    # Add sources
    result["sources"] = [
        {"video_id": str(v["id"]), "youtube_id": v["youtube_id"], "title": v["title"]}
        for v in top_videos[:5]
    ]

    return result


# ---------------------------------------------------------------------------
# Step 4: Generate embeddings
# ---------------------------------------------------------------------------

async def generate_embeddings(
    texts: list[str], client: httpx.AsyncClient
) -> list[list[float]]:
    """Generate embeddings for a batch of texts."""
    all_embeddings = []

    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {OPENAI_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": EMBEDDING_MODEL, "input": batch},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        sorted_data = sorted(data["data"], key=lambda d: d["index"])
        all_embeddings.extend([d["embedding"] for d in sorted_data])
        print(f"  Embedded {len(all_embeddings)}/{len(texts)} questions")

    return all_embeddings


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

async def main():
    print("=== Pre-Generated Answers Pipeline ===\n")

    if not ANTHROPIC_KEY or not OPENAI_KEY:
        print("ERROR: Set ANTHROPIC_API_KEY and OPENAI_API_KEY")
        sys.exit(1)

    conn = await asyncpg.connect(SUPABASE_URL, statement_cache_size=0)

    # Check if already populated
    existing = await conn.fetchval("SELECT COUNT(*) FROM pregenerated_answers")
    if existing > 0:
        print(f"Table already has {existing} answers. Delete first to regenerate.")
        print("Run: DELETE FROM pregenerated_answers;")
        await conn.close()
        return

    # Step 1: Fetch videos
    print("Step 1: Fetching videos...")
    videos = await fetch_videos(conn)
    print(f"  Found {len(videos)} videos\n")

    async with httpx.AsyncClient() as client:
        # Step 2: Generate questions
        print("Step 2: Generating questions with Haiku...")
        questions = await generate_questions(videos, client)
        if not questions:
            print("ERROR: No questions generated")
            await conn.close()
            return
        print()

        # Step 3: Generate answers in batches
        print(f"Step 3: Generating {len(questions)} answers with Sonnet...")
        answers = []
        for i in range(0, len(questions), BATCH_SIZE):
            batch = questions[i:i + BATCH_SIZE]
            batch_answers = []
            for j, q in enumerate(batch):
                try:
                    answer = await generate_answer(
                        q["question"],
                        q.get("category_slug"),
                        videos,
                        client,
                    )
                    batch_answers.append(answer)
                except Exception as e:
                    print(f"  ERROR on question {i+j+1}: {e}")
                    batch_answers.append({
                        "answer": "לא ניתן ליצור תשובה כרגע.",
                        "key_points": [], "costs": [], "tips": [], "warnings": [],
                        "sources": [],
                    })

            answers.extend(batch_answers)
            print(f"  Generated {len(answers)}/{len(questions)} answers")

            # Rate limiting
            await asyncio.sleep(1)
        print()

        # Step 4: Generate embeddings
        print("Step 4: Generating embeddings...")
        question_texts = [q["question"] for q in questions]
        embeddings = await generate_embeddings(question_texts, client)
        print()

    # Step 5: Store in DB
    print("Step 5: Storing in database...")
    for i, (q, answer, embedding) in enumerate(zip(questions, answers, embeddings)):
        emb_str = "[" + ",".join(str(v) for v in embedding) + "]"

        await conn.execute("""
            INSERT INTO pregenerated_answers
                (id, question, answer, sources, key_points, costs_data, tips, warnings,
                 category_slug, embedding, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $11)
        """,
            uuid.uuid4(),
            q["question"],
            answer.get("answer", ""),
            json.dumps(answer.get("sources", []), ensure_ascii=False),
            json.dumps(answer.get("key_points", []), ensure_ascii=False),
            json.dumps(answer.get("costs", []), ensure_ascii=False),
            json.dumps(answer.get("tips", []), ensure_ascii=False),
            json.dumps(answer.get("warnings", []), ensure_ascii=False),
            q.get("category_slug"),
            emb_str,
            datetime.utcnow(),
        )

        if (i + 1) % 50 == 0:
            print(f"  Stored {i + 1}/{len(questions)}")

    final_count = await conn.fetchval("SELECT COUNT(*) FROM pregenerated_answers")
    print(f"\nDone! {final_count} pre-generated answers stored.")

    await conn.close()


if __name__ == "__main__":
    import functools
    # Force unbuffered output
    print = functools.partial(print, flush=True)
    asyncio.run(main())
