import { describe, expect, it } from 'vitest';
import {
  TranscriptParseError,
  cuesToText,
  detectFormat,
  formatClock,
  parseClock,
  parseJson3,
  parseSbv,
  parseSrt,
  parseTranscript,
  parseTxt,
  parseVtt,
  timestampedText,
  tsToSeconds,
} from '@/lib/autopilot/transcript';

describe('timestamps', () => {
  it('parses the subtitle time formats', () => {
    expect(tsToSeconds('00:01:02.500')).toBe(62.5);
    expect(tsToSeconds('01:00:00,250')).toBe(3600.25);
    expect(tsToSeconds('02:03.100')).toBeCloseTo(123.1);
    expect(tsToSeconds('7.5')).toBe(7.5);
  });

  it('formats and parses clock strings', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75.9)).toBe('1:15');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(parseClock('1:15')).toBe(75);
    expect(parseClock('1:02:05')).toBe(3725);
    expect(parseClock('45')).toBe(45);
    expect(parseClock('abc')).toBeNull();
  });
});

describe('json3 (YouTube timedtext, as yt-dlp saved it)', () => {
  it('joins segs, skips newline-only append events and uses ms timing', () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 816849, id: 1 },
        { tStartMs: 160, dDurationMs: 7320, segs: [{ utf8: 'איפה' }, { utf8: ' אתם' }, { utf8: ' אנשים?' }] },
        { tStartMs: 2950, dDurationMs: 4530, aAppend: 1, segs: [{ utf8: '\n' }] },
        { tStartMs: 2960, dDurationMs: 9400, segs: [{ utf8: 'קורה?' }, { utf8: ' טוב,' }] },
      ],
    };
    expect(parseJson3(data)).toEqual([
      { start: 0.16, end: 7.48, text: 'איפה אתם אנשים?' },
      { start: 2.96, end: 12.36, text: 'קורה? טוב,' },
    ]);
  });

  it('tolerates junk', () => {
    expect(parseJson3(null)).toEqual([]);
    expect(parseJson3({ events: [null, 3, { segs: 'x' }] })).toEqual([]);
  });
});

describe('VTT / SRT / SBV', () => {
  it('parses WebVTT, strips tags and de-duplicates rolling caption lines', () => {
    const vtt = `WEBVTT
Kind: captions

00:00:00.160 --> 00:00:02.950 align:start position:0%
איפה<00:00:00.520><c> אתם</c>

00:00:02.950 --> 00:00:02.960
איפה אתם

00:00:02.960 --> 00:00:07.480
איפה אתם
מה קורה?

01:05.000 --> 01:07.000
בלי שעות.
`;
    expect(parseVtt(vtt)).toEqual([
      { start: 0.16, end: 2.95, text: 'איפה אתם' },
      { start: 2.96, end: 7.48, text: 'מה קורה?' },
      { start: 65, end: 67, text: 'בלי שעות.' },
    ]);
  });

  it('parses SubRip', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
שלום לכולם,
היום על יסודות.

2
00:00:04,500 --> 00:00:06,000
<i>בטון</i> ב-30`;
    expect(parseSrt(srt)).toEqual([
      { start: 1, end: 4, text: 'שלום לכולם, היום על יסודות.' },
      { start: 4.5, end: 6, text: 'בטון ב-30' },
    ]);
  });

  it('parses YouTube Studio .sbv', () => {
    const sbv = `0:00:01.000,0:00:03.500
פתיחה

0:00:03.500,0:00:06.000
שלד`;
    expect(parseSbv(sbv)).toEqual([
      { start: 1, end: 3.5, text: 'פתיחה' },
      { start: 3.5, end: 6, text: 'שלד' },
    ]);
  });
});

describe('plain text', () => {
  it('spreads sentences over the duration by character position', () => {
    const cues = parseTxt('משפט ראשון. משפט שני ארוך יותר!\nשורה שלישית', 100);
    expect(cues.map((c) => c.text)).toEqual(['משפט ראשון.', 'משפט שני ארוך יותר!', 'שורה שלישית']);
    expect(cues[0].start).toBe(0);
    expect(cues[cues.length - 1].end).toBeCloseTo(100, 0);
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeCloseTo(cues[i - 1].end, 3);
  });

  it('estimates the span from speaking rate when the duration is unknown', () => {
    const cues = parseTxt('א'.repeat(139) + '.', null);
    expect(cues[0].end).toBeCloseTo(141 / 14, 1);
  });
});

describe('format detection and parseTranscript', () => {
  it('detects formats by extension and by content', () => {
    expect(detectFormat('', 'captions.SRT')).toBe('srt');
    expect(detectFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nא')).toBe('vtt');
    expect(detectFormat('1\n00:00:01,000 --> 00:00:02,000\nא')).toBe('srt');
    expect(detectFormat('0:00:01.000,0:00:02.000\nא')).toBe('sbv');
    expect(detectFormat('{"events":[{"tStartMs":1}]}')).toBe('json3');
    expect(detectFormat('סתם טקסט של תמליל.')).toBe('txt');
  });

  it('parses any supported upload and rejects empty ones', () => {
    expect(parseTranscript('1\n00:00:01,000 --> 00:00:02,000\nשלום').cues).toHaveLength(1);
    expect(() => parseTranscript('WEBVTT\n\n')).toThrow(TranscriptParseError);
    expect(() => parseTranscript('{bad json', { format: 'json3' })).toThrow(TranscriptParseError);
  });

  it('builds transcript text and timestamped paragraphs', () => {
    const cues = [
      { start: 0, end: 10, text: 'א' },
      { start: 10, end: 26, text: 'ב' },
      { start: 26, end: 40, text: 'ג' },
    ];
    expect(cuesToText(cues)).toBe('א ב ג');
    expect(timestampedText(cues, 25)).toBe('[0:00] א ב\n[0:26] ג');
  });
});
