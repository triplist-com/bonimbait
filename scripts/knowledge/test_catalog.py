"""Unit tests for scripts/knowledge (no network, no data files).

Run: scripts/.venv/bin/python -m unittest scripts.knowledge.test_catalog -v
"""

from __future__ import annotations

import unittest
from datetime import date

from scripts.knowledge.catalog import (
    boilerplate_lines,
    chapters_from_description,
    clean_description,
    clean_title,
    normalize_chapters,
    playlist_category,
    rule_category,
    summary_from_description,
    title_category,
)
from scripts.knowledge.fetch_captions import BLOCK_PATTERNS, UNAVAILABLE_PATTERNS, pick_track
from scripts.knowledge.inventory import classify, in_index_scope, interpolate_dates
from scripts.knowledge.summarize import mmss, select, to_record, transcript_with_markers

TEMPLATE = "📌 מתכננים לבנות בית? קבעו עכשיו פגישת ייעוץ » https://tinyurl.com/x\n\nשלכם,\nתומר חן ריחאנה וצוות בונים בית 🏠"


class DescriptionTests(unittest.TestCase):
    def test_boilerplate_is_lines_shared_by_many_descriptions(self) -> None:
        descs = [f"{TEMPLATE}\nסרטון {i}" for i in range(10)]
        bp = boilerplate_lines(descs, min_share=0.2, min_count=5)
        self.assertIn("שלכם,", bp)
        self.assertNotIn("סרטון 3", bp)

    def test_clean_description_keeps_only_content(self) -> None:
        desc = f"בסרטון הזה מסבירים על בטון ב-30.\n0:00 פתיחה\n1:20 בדיקות\nhttps://example.com\n#בנייה\n{TEMPLATE}"
        bp = boilerplate_lines([TEMPLATE] * 6)
        self.assertEqual(clean_description(desc, bp), "בסרטון הזה מסבירים על בטון ב-30.")

    def test_template_only_description_is_empty(self) -> None:
        self.assertEqual(clean_description(TEMPLATE, boilerplate_lines([TEMPLATE] * 6)), "")

    def test_summary_cuts_on_a_word_boundary(self) -> None:
        text = "מילה " * 100
        out = summary_from_description(text.strip(), max_chars=50)
        self.assertTrue(out.endswith("…"))
        self.assertLessEqual(len(out), 51)
        self.assertEqual(summary_from_description("קצר"), "קצר")


class ChapterTests(unittest.TestCase):
    def test_parses_timestamp_lines(self) -> None:
        desc = "0:00 – פתיחה\n1:36 – חן רוזן: בן 54\n1:02:05 סיכום\nשורה רגילה"
        self.assertEqual(
            chapters_from_description(desc),
            [
                {"start_time": 0, "title": "פתיחה"},
                {"start_time": 96, "title": "חן רוזן: בן 54"},
                {"start_time": 3725, "title": "סיכום"},
            ],
        )

    def test_needs_two_ascending_stamps(self) -> None:
        self.assertEqual(chapters_from_description("0:00 פתיחה"), [])
        self.assertEqual(chapters_from_description("5:00 א\n1:00 ב"), [])

    def test_strips_emoji_from_titles(self) -> None:
        self.assertEqual(clean_title("️ עובש במקלחות 🚿"), "עובש במקלחות")
        self.assertEqual(chapters_from_description("0:00 🏠 פתיחה\n2:00 ️סוף")[0]["title"], "פתיחה")

    def test_normalizes_ytdlp_chapters(self) -> None:
        chs = [{"start_time": 0.0, "end_time": 96.0, "title": "פתיחה"}, {"start_time": 96.4, "end_time": 200, "title": " חלק ב "}]
        self.assertEqual(normalize_chapters(chs, duration=300), [{"start_time": 0, "title": "פתיחה"}, {"start_time": 96, "title": "חלק ב"}])
        self.assertEqual(normalize_chapters(chs[:1]), [])


class CategoryTests(unittest.TestCase):
    def test_playlist_majority_and_ties(self) -> None:
        self.assertEqual(playlist_category(["חשמל", "מדריך הבניה"]), "electrical-plumbing")
        self.assertIsNone(playlist_category(["חשמל", "טיח"]))
        self.assertIsNone(playlist_category(["פודקאסט בונים בית"]))

    def test_title_needs_a_single_category(self) -> None:
        self.assertEqual(title_category("מתחילים ריצוף - מה חשוב בשלב הזה?!"), "finishes-design")
        self.assertIsNone(title_category("עלויות ריצוף"))  # costs + finishes
        self.assertEqual(title_category("איך בוחרים קבלן שלד?"), None)  # contractors + structure

    def test_playlist_beats_title(self) -> None:
        self.assertEqual(rule_category("קבלן ריצוף", ["טיח"]), ("finishes-design", "playlist"))
        self.assertEqual(rule_category("סיור שלד בצפון", []), ("structure-construction", "title"))
        self.assertEqual(rule_category("שיחה פתוחה", []), (None, ""))


class InventoryTests(unittest.TestCase):
    def test_type_precedence(self) -> None:
        self.assertEqual(classify({"videos"}, {"PLJa3K86i-6XenqhecEwRKLvqf5azCGHn-"}), "podcast")
        self.assertEqual(classify({"streams"}, set()), "live")
        self.assertEqual(classify({"shorts"}, set()), "short")
        self.assertEqual(classify({"videos"}, set()), "video")

    def test_index_scope_drops_short_videos(self) -> None:
        self.assertFalse(in_index_scope("video", 59))
        self.assertTrue(in_index_scope("video", 90))
        self.assertFalse(in_index_scope("short", None))
        self.assertTrue(in_index_scope("video", None))

    def test_interpolates_between_known_dates(self) -> None:
        ids = ["a", "b", "c", "d", "e"]
        exact = {"a": "2026-01-11", "c": "2026-01-01"}
        out = interpolate_dates(ids, exact)
        self.assertEqual(out["b"], "2026-01-06")
        self.assertEqual(out["d"], "2026-01-01")  # past the last known date
        self.assertTrue(all(date.fromisoformat(v) for v in out.values()))


class CaptionTests(unittest.TestCase):
    def test_manual_beats_auto(self) -> None:
        info = {"subtitles": {"iw": [{}]}, "automatic_captions": {"iw-orig": [{}], "iw": [{}]}}
        self.assertEqual(pick_track(info), ("manual_he", "iw"))

    def test_auto_needs_hebrew_asr(self) -> None:
        self.assertEqual(pick_track({"automatic_captions": {"iw-orig": [{}], "iw": [{}]}}), ("auto_he", "iw"))
        # "iw" alone is a machine translation of another language's ASR.
        self.assertIsNone(pick_track({"automatic_captions": {"en-orig": [{}], "iw": [{}]}}))
        self.assertIsNone(pick_track({}))

    def test_caption_chars_spots_stub_tracks(self) -> None:
        from scripts.knowledge.fetch_captions import MIN_MANUAL_CHARS, caption_chars

        stub = {"events": [{"tStartMs": 0}, {"segs": [{"utf8": "[מוזיקה]"}]}]}
        real = {"events": [{"segs": [{"utf8": "שלום "}, {"utf8": "לכולם"}]}] * 40}
        self.assertLess(caption_chars(stub), MIN_MANUAL_CHARS)
        self.assertEqual(caption_chars(real), 400)

    def test_error_classification(self) -> None:
        self.assertTrue(BLOCK_PATTERNS.search("ERROR: Sign in to confirm you're not a bot"))
        self.assertTrue(BLOCK_PATTERNS.search("HTTP Error 429: Too Many Requests"))
        self.assertFalse(BLOCK_PATTERNS.search("Sign in to confirm your age"))
        self.assertTrue(UNAVAILABLE_PATTERNS.search("Sign in to confirm your age"))
        self.assertTrue(UNAVAILABLE_PATTERNS.search("ERROR: [youtube] x: Private video"))


class MarksTests(unittest.TestCase):
    def test_marks_map_offsets_to_seconds(self) -> None:
        from scripts.build_search_index import segment_marks

        lines = [{"start": 100.0, "text": "שלום"}, {"start": 104.0, "text": "לכולם"}, {"start": 112.5, "text": "שלד"}, {"start": 130.0, "text": "סוף"}]
        seg = {"start_time": 100.0, "text": "שלום לכולם שלד"}
        self.assertEqual(segment_marks(lines, seg, every=10), [[0, 100], [11, 112]])

    def test_marks_give_up_when_lines_do_not_match(self) -> None:
        from scripts.build_search_index import segment_marks

        lines = [{"start": 0.0, "text": "אחר"}]
        self.assertEqual(segment_marks(lines, {"start_time": 0.0, "text": "שונה לגמרי"}), [])
        self.assertEqual(segment_marks(lines, {"start_time": 5.0, "text": "אחר"}), [])


class SummarizeTests(unittest.TestCase):
    def test_markers_about_every_minute(self) -> None:
        lines = [{"start": s, "text": f"מילה{s}"} for s in (0, 20, 61, 70, 125)]
        out = transcript_with_markers(lines, every=60)
        self.assertEqual(out.count("["), 3)
        self.assertIn("[01:01] מילה61", out)
        self.assertEqual(mmss(3725), "1:02:05")

    def test_markers_respect_the_char_cap(self) -> None:
        lines = [{"start": i, "text": "א" * 50} for i in range(100)]
        self.assertLessEqual(len(transcript_with_markers(lines, max_chars=500)), 520)

    def test_select_newest_then_most_viewed(self) -> None:
        vids = [
            {"youtube_id": "a", "published_at": "2026-09-01", "view_count": 10, "has_transcript": True},
            {"youtube_id": "b", "published_at": "2026-01-01", "view_count": 9000, "has_transcript": True},
            {"youtube_id": "c", "published_at": "2026-08-01", "view_count": 5, "has_transcript": True},
            {"youtube_id": "d", "published_at": "2026-10-01", "view_count": 1, "has_transcript": False},
            {"youtube_id": "e", "published_at": "2026-07-01", "view_count": 99999, "has_transcript": True, "key_points": ["x"]},
        ]
        self.assertEqual([v["youtube_id"] for v in select(vids, 2, set())], ["a", "b"])
        self.assertEqual([v["youtube_id"] for v in select(vids, 3, {"a"})], ["c", "b"])

    def test_to_record_clamps_times(self) -> None:
        data = {
            "summary": " סיכום ",
            "key_points": [{"text": "א", "t": 30}, {"text": "ב", "t": 999}, {"text": " ", "t": 1}],
            "costs": [{"item": "רשת", "price": "200 ש\"ח", "unit": "מ\"ר", "context": ""}, {"item": "", "price": "1", "unit": "", "context": ""}],
            "tips": ["טיפ"],
            "warnings": [],
        }
        rec = to_record(data, duration=600)
        self.assertEqual(rec["summary"], "סיכום")
        self.assertEqual(rec["key_points"], ["א", "ב"])
        self.assertEqual(rec["key_point_times"], [30, None])
        self.assertEqual(len(rec["costs"]), 1)


if __name__ == "__main__":
    unittest.main()
