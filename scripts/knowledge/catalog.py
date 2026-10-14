"""Pure helpers for video catalog records: descriptions, chapters, categories.

Kept free of I/O so they can be unit-tested (tests/test_knowledge_catalog.py).
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Sequence

# Category slugs and names of apps/web/data/videos.json (unchanged).
CATEGORY_NAMES = {
    "planning-permits": "תכנון ורישוי",
    "structure-construction": "שלד ובנייה",
    "finishes-design": "גמרים ועיצוב",
    "electrical-plumbing": "חשמל ואינסטלציה",
    "contractors-labor": "קבלנים ועבודה",
    "costs-pricing": "עלויות ומחירים",
    "general-tips": "טיפים כלליים",
    "landscaping-yard": "חצר ופיתוח",
}

# The owner's topical playlists are a free, human-made label.
# Broad playlists (podcast, "מדריך הבניה", tours, lectures, projects) carry no label.
PLAYLIST_CATEGORY = {
    "חשמל": "electrical-plumbing",
    "אינסטלציה": "electrical-plumbing",
    "תאורה": "electrical-plumbing",
    "מיזוג אוויר": "electrical-plumbing",
    "חימום תת רצפתי": "electrical-plumbing",
    "דוד שמש": "electrical-plumbing",
    "אבטחה, מצלמות ואזעקות": "electrical-plumbing",
    "שלד": "structure-construction",
    "בטון וברזל": "structure-construction",
    "בלוקים": "structure-construction",
    "שיטת בניה ICF": "structure-construction",
    "בניה מתקדמת": "structure-construction",
    "מרתף": "structure-construction",
    "איטום": "structure-construction",
    "בידוד תרמי": "structure-construction",
    "טיח": "finishes-design",
    "צבע וגבס": "finishes-design",
    "ריצוף וסניטריה": "finishes-design",
    "מקלחות": "finishes-design",
    "מטבחים": "finishes-design",
    "חלונות": "finishes-design",
    "אלומיניום": "finishes-design",
    "תריסים": "finishes-design",
    "התקנת אלומיניום בגדרה": "finishes-design",
    "בריכות": "landscaping-yard",
    "משכנתא": "costs-pricing",
    "תקציב ועלויות בניה ושיפוץ": "costs-pricing",
    "בעלי מקצוע": "contractors-labor",
}

# Title keywords (substring match on the sofit-normalised title). A title rule
# applies only when exactly one category matches.
TITLE_KEYWORDS = {
    "planning-permits": ["היתר", "תב\"ע", "תבע", "ועדה", "רישוי", "אדריכל", "תכנון", "קווי בנין", "זכויות בניה", "מגרש", "טופוגרפיה", "מודד"],
    "structure-construction": ["שלד", "בטון", "יסוד", "יציקה", "יציקת", "ברזל", "כלונס", "תקרה", "בלוק", "ICF", "איטום", "בידוד", "מרתף", "קונסטרוקט", "גג רעפים", "פלדה"],
    "finishes-design": ["ריצוף", "טיח", "שליכט", "צבע", "חיפוי", "גבס", "אריח", "פרקט", "מטבח", "אלומיניום", "חלון", "חלונות", "תריס", "מקלחת", "אסלה", "סניטריה", "דלת", "דלתות", "עיצוב"],
    "electrical-plumbing": ["חשמל", "אינסטלציה", "צנרת", "מיזוג", "מזגן", "חימום", "תאורה", "דוד שמש", "סולארי", "ביוב", "ניאגרה", "מתח נמוך", "בית חכם", "חלחול", "ניקוז"],
    "contractors-labor": ["קבלן", "קבלנים", "פיקוח", "מפקח", "בעלי מקצוע", "בעל מקצוע", "חוזה"],
    "costs-pricing": ["עלות", "עלויות", "מחיר", "כמה עולה", "תקציב", "משכנתא", "חיסכון", "לחסוך"],
    "landscaping-yard": ["גינה", "חצר", "גדר", "פרגולה", "בריכה", "פיתוח שטח", "דשא"],
}

_SOFIT = str.maketrans("ךםןףץ", "כמנפצ")
# Emoji and pictographs (So/Sk), variation selectors and joiners (Mn/Cf).
_SYMBOL_CATS = {"So", "Sk", "Cf", "Mn"}
_TIMESTAMP = re.compile(r"^\s*[\(\[]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\)\]]?\s*[-–—:|.]?\s*(.*\S)?\s*$")
_URL = re.compile(r"https?://\S+")


def normalize(text: str) -> str:
    return (text or "").translate(_SOFIT)


def boilerplate_lines(descriptions: Iterable[str], min_share: float = 0.2, min_count: int = 5) -> set[str]:
    """Lines repeated across many descriptions (the channel's CTA template)."""
    descs = list(descriptions)
    counts: Counter = Counter()
    for d in descs:
        counts.update({ln.strip() for ln in (d or "").splitlines() if ln.strip()})
    threshold = max(min_count, int(len(descs) * min_share))
    return {ln for ln, n in counts.items() if n >= threshold}


def clean_title(title: str) -> str:
    """Trim whitespace and leading/trailing emoji, variation selectors and joiners."""
    t = (title or "").strip()
    while t and (t[0].isspace() or unicodedata.category(t[0]) in _SYMBOL_CATS):
        t = t[1:]
    while t and (t[-1].isspace() or unicodedata.category(t[-1]) in _SYMBOL_CATS):
        t = t[:-1]
    return t[:120]


def parse_timestamp(ts: str) -> int:
    parts = [int(p) for p in ts.split(":")]
    secs = 0
    for p in parts:
        secs = secs * 60 + p
    return secs


def chapters_from_description(description: str) -> list[dict]:
    """[{start_time, title}] from "0:00 - title" lines; empty unless there are 2+ ascending stamps."""
    out: list[dict] = []
    for line in (description or "").splitlines():
        m = _TIMESTAMP.match(line)
        if not m or not m.group(2):
            continue
        title = clean_title(_URL.sub("", m.group(2)).strip(" -–—|:"))
        if not title:
            continue
        out.append({"start_time": parse_timestamp(m.group(1)), "title": title})
    if len(out) < 2:
        return []
    # Keep a strictly ascending run (descriptions sometimes repeat or reorder stamps).
    run: list[dict] = []
    for ch in out:
        if not run or ch["start_time"] > run[-1]["start_time"]:
            run.append(ch)
    return run if len(run) >= 2 else []


def normalize_chapters(chapters: Sequence[dict] | None, duration: float | None = None) -> list[dict]:
    """yt-dlp chapters ({start_time, end_time, title}) -> [{start_time, title}]."""
    out = []
    for ch in chapters or []:
        title = clean_title(ch.get("title") or "")
        start = ch.get("start_time")
        if not title or start is None:
            continue
        if duration and start >= duration:
            continue
        out.append({"start_time": int(round(float(start))), "title": title})
    out.sort(key=lambda c: c["start_time"])
    return out if len(out) >= 2 else []


def clean_description(description: str, boilerplate: set[str]) -> str:
    """Description without the CTA template, timestamp lines, link-only lines and hashtags."""
    kept: list[str] = []
    for raw in (description or "").splitlines():
        line = raw.strip()
        if not line:
            if kept and kept[-1]:
                kept.append("")
            continue
        if line in boilerplate or _TIMESTAMP.match(line):
            continue
        without_urls = _URL.sub("", line).strip(" »:-–—|")
        if not without_urls or line.startswith("#"):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def summary_from_description(cleaned: str, max_chars: int = 300) -> str:
    """First paragraph of the cleaned description, cut on a word boundary."""
    para = cleaned.split("\n\n")[0].strip() if cleaned else ""
    if len(para) <= max_chars:
        return para
    cut = para[:max_chars].rsplit(" ", 1)[0]
    return cut + "…"


def playlist_category(playlists: Iterable[str]) -> str | None:
    """Majority category of the video's topical playlists (None on a tie or no topical playlist)."""
    votes = Counter(PLAYLIST_CATEGORY[p] for p in playlists if p in PLAYLIST_CATEGORY)
    if not votes:
        return None
    (top, n), *rest = votes.most_common()
    if rest and rest[0][1] == n:
        return None
    return top


def title_categories(title: str) -> set[str]:
    """Categories whose keywords appear in the title.

    Cost words ("כמה עולה", "עלויות") ride along in titles of every topic, so they
    yield to any other matched category ("מקלחות... כמה עולה מקלחת" is a finishes video).
    """
    t = normalize(title).lower()
    hits = {slug for slug, kws in TITLE_KEYWORDS.items() if any(normalize(k).lower() in t for k in kws)}
    if len(hits) > 1:
        hits.discard("costs-pricing")
    return hits


def title_category(title: str) -> str | None:
    """The single category the title points to, else None."""
    hits = title_categories(title)
    return next(iter(hits)) if len(hits) == 1 else None


def rule_category(title: str, playlists: Iterable[str]) -> tuple[str | None, str]:
    """(category, rule) from the topical playlists first, then the title."""
    cat = playlist_category(playlists)
    if cat:
        return cat, "playlist"
    cat = title_category(title)
    if cat:
        return cat, "title"
    return None, ""


def candidate_categories(title: str) -> set[str]:
    """Categories an undecided video may go to: the tied title matches, else all."""
    hits = title_categories(title)
    return hits if len(hits) > 1 else set(CATEGORY_NAMES)
