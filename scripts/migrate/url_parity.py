#!/usr/bin/env python3
"""Check that every URL in the live site's sitemaps resolves on a target base URL.

Loads every <loc> from all sitemaps in the live sitemap_index.xml (cached to
data/migration/live_urls.json), requests the same path + query against --base,
and records the status per URL: 200, 301/302/307/308 -> target, 404, etc.

Outputs:
  data/migration/parity_report.csv          one row per URL
  data/migration/parity_baseline_live.csv   written when --base is the live site
  stdout                                    summary by URL type (sitemap)

A URL passes when it returns 200, or when it redirects to the same path the live
site redirects it to (the live sitemaps list a few URLs that 301/302 already).
Exit code is 0 only when every URL passes.

Use --concurrency 4 or lower against the live site.

Usage:
  python scripts/migrate/url_parity.py --base https://staging.example.com
  python scripts/migrate/url_parity.py --base https://bonimbayit.co.il --refresh-urls
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse, urlunparse

import requests

from common import LIVE_BASE, MIGRATION_DIR, USER_AGENT, fetch, sitemap_locs, soup, write_json

URLS_FILE = MIGRATION_DIR / "live_urls.json"
REPORT_CSV = MIGRATION_DIR / "parity_report.csv"
BASELINE_CSV = MIGRATION_DIR / "parity_baseline_live.csv"
EXCEPTIONS_FILE = Path(__file__).with_name("parity_exceptions.json")


def load_exceptions() -> dict[str, dict[str, str]]:
    """Intentional differences from live, keyed by decoded path with trailing slash."""
    if not EXCEPTIONS_FILE.exists():
        return {}
    return json.loads(EXCEPTIONS_FILE.read_text(encoding="utf-8"))["exceptions"]


def load_baseline(path: str) -> dict[str, dict[str, str]]:
    f = Path(path)
    if not f.exists():
        return {}
    with f.open(encoding="utf-8") as fh:
        return {row["live_url"]: row for row in csv.DictReader(fh)}


def location_path(loc: str) -> str:
    """Compare redirect targets by path + query only, so bases can differ."""
    u = urlparse(loc)
    return unquote(u.path.rstrip("/")) + (f"?{unquote(u.query)}" if u.query else "")


def load_live_urls(refresh: bool) -> list[dict[str, str]]:
    """[{url, type}] for every <loc> in every sitemap of the live index."""
    if URLS_FILE.exists() and not refresh:
        return json.loads(URLS_FILE.read_text(encoding="utf-8"))["urls"]
    index_body, _ = fetch(f"{LIVE_BASE}/sitemap_index.xml", kind="xml", use_cache=not refresh)
    idx = soup(index_body)
    sitemaps = [loc.get_text(strip=True) for loc in idx.find_all("loc")]
    urls: list[dict[str, str]] = []
    for sm in sitemaps:
        kind = urlparse(sm).path.strip("/").removesuffix(".xml").removesuffix("-sitemap")
        for loc in sitemap_locs(sm, use_cache=not refresh):
            urls.append({"url": loc, "type": kind})
    write_json("live_urls.json", {"fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "sitemaps": sitemaps, "count": len(urls), "urls": urls})
    return urls


def normalize_path(path: str) -> str:
    """Percent-encode raw (e.g. Hebrew) characters while keeping existing %XX escapes as-is."""
    return quote(path, safe="/:@!$&'()*+,;=-._~%")


def target_url(live_url: str, base: str) -> str:
    live = urlparse(live_url)
    b = urlparse(base.rstrip("/"))
    path = normalize_path(b.path + live.path)
    return urlunparse((b.scheme, b.netloc, path, "", live.query, ""))


def check(session: requests.Session, url: str, retries: int = 3) -> dict[str, Any]:
    last_err = ""
    for attempt in range(retries):
        try:
            r = session.get(url, allow_redirects=False, timeout=30, stream=True)
            r.close()
            loc = r.headers.get("Location")
            return {"status": r.status_code, "location": unquote(loc) if loc else ""}
        except requests.RequestException as exc:
            last_err = repr(exc)
            time.sleep(2 ** attempt)
    return {"status": 0, "location": "", "error": last_err}


def classify(status: int) -> str:
    if status == 200:
        return "200"
    if status in (301, 308):
        return "301"
    if status in (302, 303, 307):
        return "302"
    if status == 404:
        return "404"
    if status == 0:
        return "error"
    return str(status)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True, help="target base URL, e.g. https://staging.bonimbayit.co.il")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--refresh-urls", action="store_true", help="re-download the live sitemaps")
    ap.add_argument("--follow", action="store_true", help="for redirects, also request the target and record its final status")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument(
        "--baseline",
        default=str(BASELINE_CSV),
        help="CSV from a run against the live site; a URL passes if it behaves like live "
        "(the live sitemaps themselves contain a few 301/302s). Written automatically when --base is the live site.",
    )
    args = ap.parse_args()
    is_live = urlparse(args.base).netloc == urlparse(LIVE_BASE).netloc

    urls = load_live_urls(args.refresh_urls)
    if args.limit:
        urls = urls[: args.limit]
    print(f"Checking {len(urls)} URLs against {args.base} (concurrency {args.concurrency})")

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    adapter = requests.adapters.HTTPAdapter(pool_connections=args.concurrency, pool_maxsize=args.concurrency)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {pool.submit(check, session, target_url(u["url"], args.base)): u for u in urls}
        for i, fut in enumerate(as_completed(futures), 1):
            u = futures[fut]
            res = fut.result()
            row = {
                "type": u["type"],
                "live_url": u["url"],
                "path": unquote(urlparse(u["url"]).path),
                "target_url": target_url(u["url"], args.base),
                "status": res["status"],
                "result": classify(res["status"]),
                "location": res.get("location", ""),
                "final_status": "",
                "error": res.get("error", ""),
            }
            if args.follow and row["location"]:
                loc = row["location"]
                if loc.startswith("/"):
                    loc = args.base.rstrip("/") + loc
                row["final_status"] = session.get(loc, timeout=30).status_code
            rows.append(row)
            if i % 200 == 0:
                print(f"  {i}/{len(urls)}")

    order = {u["url"]: n for n, u in enumerate(urls)}
    rows.sort(key=lambda r: order[r["live_url"]])

    # Pass = 200, or the same redirect behaviour the live site has for that URL.
    baseline = {} if is_live else load_baseline(args.baseline)
    exceptions = {} if is_live else load_exceptions()
    for r in rows:
        live = baseline.get(r["live_url"])
        r["live_result"] = live["result"] if live else ""
        r["live_location"] = live["location"] if live else ""
        same_as_live = bool(live) and live["result"] == r["result"] and location_path(live["location"]) == location_path(r["location"])
        exc = exceptions.get(r["path"])
        r["accepted_exception"] = bool(exc) and exc["result"] == r["result"] and location_path(exc["location"]) == location_path(r["location"])
        r["pass"] = r["result"] == "200" or same_as_live or r["accepted_exception"] or (is_live and r["result"] in ("301", "302"))

    MIGRATION_DIR.mkdir(parents=True, exist_ok=True)
    targets = [REPORT_CSV] + ([Path(args.baseline)] if is_live and not args.limit else [])
    for target in targets:
        with target.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["type"])
            w.writeheader()
            w.writerows(rows)
    if is_live and not args.limit:
        print(f"Saved live baseline to {args.baseline}")

    by_type: dict[str, Counter[str]] = defaultdict(Counter)
    for r in rows:
        by_type[r["type"]][r["result"]] += 1
    results = sorted({r["result"] for r in rows})
    print()
    print(f"{'type':<20}{'total':>7}" + "".join(f"{x:>8}" for x in results))
    for t, c in by_type.items():
        print(f"{t:<20}{sum(c.values()):>7}" + "".join(f"{c.get(x, 0):>8}" for x in results))
    total = Counter(r["result"] for r in rows)
    print(f"{'ALL':<20}{len(rows):>7}" + "".join(f"{total.get(x, 0):>8}" for x in results))
    ok = total.get("200", 0)
    passed = sum(1 for r in rows if r["pass"])
    print(f"\n{ok}/{len(rows)} returned 200 ({100 * ok / max(len(rows), 1):.1f}%); "
          f"{passed}/{len(rows)} pass (200, same redirect as live, or an accepted exception). Report: {REPORT_CSV}")
    for r in [r for r in rows if r["result"] != "200"][:30]:
        mark = ("exc " if r.get("accepted_exception") else "ok  ") if r["pass"] else "FAIL"
        print(f"  {mark} {r['status']} {r['path']} {('-> ' + r['location']) if r['location'] else ''}")
    sys.exit(0 if passed == len(rows) else 1)


if __name__ == "__main__":
    main()
