import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeXmlText, parseDuration, parsePodcastFeed, parseYoutubeFeed, youtubeFeedUrl } from '@/lib/autopilot/rss';

const feed = readFileSync(join(__dirname, 'fixtures/youtube-feed.xml'), 'utf8');

const PODCAST = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>פודקאסט בונים בית</title>
  <itunes:image href="https://cdn.example.test/show.jpg"/>
  <item>
    <title><![CDATA[פרק 114 - ביטוח & אחריות]]></title>
    <guid isPermaLink="false">episode-114</guid>
    <pubDate>Thu, 08 Oct 2026 18:30:00 +0000</pubDate>
    <enclosure url="https://cdn.example.test/114.mp3" length="123" type="audio/mpeg"/>
    <itunes:duration>1:02:03</itunes:duration>
    <itunes:image href="https://cdn.example.test/114.jpg"/>
  </item>
  <item>
    <title>פרק 113 &#8211; בלי GUID</title>
    <enclosure url='https://cdn.example.test/113.mp3' type='audio/mpeg'/>
    <itunes:duration>2725</itunes:duration>
  </item>
  <item>
    <description>no title, dropped</description>
  </item>
</channel>
</rss>`;

describe('YouTube channel feed', () => {
  it('builds the feed URL for the channel', () => {
    expect(youtubeFeedUrl('UCCehs0A1gUmOUtZIhvkXVJQ')).toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCCehs0A1gUmOUtZIhvkXVJQ',
    );
  });

  it('parses entries, decodes entities and drops invalid ids', () => {
    const items = parseYoutubeFeed(feed);
    expect(items.map((i) => i.externalId)).toEqual(['EeMos4VM2oU', 'trfkU0TW8RI']);
    expect(items[0]).toMatchObject({
      kind: 'youtube',
      title: 'חיפוי אבן פראית: כמה זה עולה ומה חשוב לבדוק בשטח?!',
      url: 'https://www.youtube.com/watch?v=EeMos4VM2oU',
      publishedAt: '2026-10-11T18:30:05.000Z',
      thumbnailUrl: 'https://i.ytimg.com/vi/EeMos4VM2oU/hqdefault.jpg',
      durationS: null,
    });
    expect(items[1].title).toBe('איך מתקינים ויטרינת ענק של 270 ק"ג בלי טעויות?');
    expect(items[0].description).toContain('מתכננים לבנות בית');
  });

  it('returns nothing for an empty or broken document', () => {
    expect(parseYoutubeFeed('')).toEqual([]);
    expect(parseYoutubeFeed('<html><body>Error 500</body></html>')).toEqual([]);
    expect(parseYoutubeFeed('<feed><entry><yt:videoId>EeMos4VM2oU</yt:videoId>')).toEqual([]);
  });
});

describe('podcast feed', () => {
  it('parses items with GUID, enclosure, duration and artwork', () => {
    const items = parsePodcastFeed(PODCAST);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'podcast',
      externalId: 'episode-114',
      title: 'פרק 114 - ביטוח & אחריות',
      url: 'https://cdn.example.test/114.mp3',
      publishedAt: '2026-10-08T18:30:00.000Z',
      durationS: 3723,
      thumbnailUrl: 'https://cdn.example.test/114.jpg',
    });
    // No GUID: the enclosure URL is the id; channel artwork is the fallback.
    expect(items[1]).toMatchObject({
      externalId: 'https://cdn.example.test/113.mp3',
      title: 'פרק 113 – בלי GUID',
      durationS: 2725,
      thumbnailUrl: 'https://cdn.example.test/show.jpg',
    });
  });
});

describe('helpers', () => {
  it('decodes entities but keeps CDATA literal', () => {
    expect(decodeXmlText('a &amp; b &lt;c&gt; &#x5D0; &#1488; &quot;x&quot;')).toBe('a & b <c> א א "x"');
    expect(decodeXmlText('<![CDATA[&amp; stays]]>')).toBe('&amp; stays');
  });

  it('parses itunes durations', () => {
    expect(parseDuration('45:30')).toBe(2730);
    expect(parseDuration('01:00:00')).toBe(3600);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
});
