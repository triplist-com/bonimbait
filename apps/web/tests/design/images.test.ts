import { describe, expect, it } from 'vitest';
import { isOptimizableImage } from '@/lib/images';
import { youtubeEmbedUrl } from '@/components/ui/YouTubeFacade';

const patterns = [
  { protocol: 'https:', hostname: 'i.ytimg.com', pathPrefix: '/vi/' },
  { protocol: 'http:', hostname: '127.0.0.1', port: '54321', pathPrefix: '/storage/v1/object/public/' },
];

describe('next/image host guard', () => {
  it('accepts local paths and configured hosts', () => {
    expect(isOptimizableImage('/brand/tomer-trailer-poster.jpg', patterns)).toBe(true);
    expect(isOptimizableImage('https://i.ytimg.com/vi/abc/hqdefault.jpg', patterns)).toBe(true);
    expect(isOptimizableImage('http://127.0.0.1:54321/storage/v1/object/public/media/x.jpg', patterns)).toBe(true);
  });

  it('rejects other hosts, paths, ports and protocols', () => {
    expect(isOptimizableImage('https://cdn.example.com/x.jpg', patterns)).toBe(false);
    expect(isOptimizableImage('https://i.ytimg.com/other/x.jpg', patterns)).toBe(false);
    expect(isOptimizableImage('http://127.0.0.1:9999/storage/v1/object/public/x.jpg', patterns)).toBe(false);
    expect(isOptimizableImage('http://i.ytimg.com/vi/abc/hqdefault.jpg', patterns)).toBe(false);
    expect(isOptimizableImage('//evil.example/x.jpg', patterns)).toBe(false);
    expect(isOptimizableImage(null, patterns)).toBe(false);
    expect(isOptimizableImage('not a url', patterns)).toBe(false);
  });
});

describe('YouTube facade embed URL', () => {
  it('autoplays from nocookie, with an optional start second', () => {
    expect(youtubeEmbedUrl('9803SaFIvXM')).toBe('https://www.youtube-nocookie.com/embed/9803SaFIvXM?autoplay=1&rel=0&modestbranding=1&playsinline=1');
    expect(youtubeEmbedUrl('9803SaFIvXM', 157.9)).toContain('&start=157');
    expect(youtubeEmbedUrl('x', 0)).not.toContain('start=');
  });
});
