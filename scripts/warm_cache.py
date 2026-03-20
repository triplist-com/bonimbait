"""
Cache warming script for bonimbait.com.

Fires the top 20 most common search queries against the API to pre-warm
both the search cache and answer cache. Run after deployment.

Usage:
    python scripts/warm_cache.py [--api-url https://bonimbait.com]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time

import httpx

# Top 20 most common Hebrew construction search queries
WARM_QUERIES = [
    "כמה עולה לבנות בית",
    "עלות בניית בית פרטי",
    "היתר בנייה",
    "קבלן שלד",
    "עלות שלד",
    "חשמלאי בניין",
    "אינסטלציה",
    "ריצוף",
    "גג רעפים",
    "בידוד תרמי",
    "טיח חוץ",
    "מטבח עלויות",
    "חלונות אלומיניום",
    "פיתוח חצר",
    "גדר בניה",
    "תכנון אדריכלי",
    "מהנדס בניין",
    "יועץ קרקע",
    "עלות גמר",
    "לוח זמנים בנייה",
]


async def warm_search(client: httpx.AsyncClient, base_url: str, query: str) -> bool:
    """Fire a search query and return True on success."""
    try:
        resp = await client.get(
            f"{base_url}/api/search",
            params={"q": query},
            timeout=15.0,
        )
        return resp.status_code == 200
    except Exception as exc:
        print(f"  [FAIL] search '{query}': {exc}")
        return False


async def warm_answer(client: httpx.AsyncClient, base_url: str, query: str) -> bool:
    """Fire an answer query and return True on success."""
    try:
        resp = await client.post(
            f"{base_url}/api/answer",
            json={"query": query},
            timeout=30.0,
        )
        return resp.status_code == 200
    except Exception as exc:
        print(f"  [FAIL] answer '{query}': {exc}")
        return False


async def main(api_url: str) -> None:
    print(f"Warming cache at {api_url}")
    print(f"Queries to warm: {len(WARM_QUERIES)}")
    print()

    start = time.time()
    search_ok = 0
    answer_ok = 0

    async with httpx.AsyncClient() as client:
        # Warm search cache (run concurrently in batches of 5)
        print("--- Warming search cache ---")
        for i in range(0, len(WARM_QUERIES), 5):
            batch = WARM_QUERIES[i : i + 5]
            results = await asyncio.gather(
                *[warm_search(client, api_url, q) for q in batch]
            )
            for q, ok in zip(batch, results):
                status = "OK" if ok else "FAIL"
                print(f"  [{status}] search: {q}")
                if ok:
                    search_ok += 1

        print()
        print("--- Warming answer cache ---")
        # Warm answer cache (run sequentially to avoid overloading LLM)
        for q in WARM_QUERIES:
            ok = await warm_answer(client, api_url, q)
            status = "OK" if ok else "FAIL"
            print(f"  [{status}] answer: {q}")
            if ok:
                answer_ok += 1

    elapsed = time.time() - start
    print()
    print(f"Done in {elapsed:.1f}s")
    print(f"Search: {search_ok}/{len(WARM_QUERIES)} OK")
    print(f"Answer: {answer_ok}/{len(WARM_QUERIES)} OK")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Warm bonimbait caches")
    parser.add_argument(
        "--api-url",
        default="https://bonimbait.com",
        help="Base URL of the API (default: https://bonimbait.com)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.api_url))
