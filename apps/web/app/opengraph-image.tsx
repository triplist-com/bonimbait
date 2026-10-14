import { ImageResponse } from 'next/og';
import { SITE_HOST } from '@/lib/site';
import { ink, primary } from '@/lib/design/tokens';
import { visualHebrew, visualWords } from '@/lib/og/rtl';

export const runtime = 'edge';

export const alt = 'בונים בית - אתכם עד המפתח';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const HEADLINE = 'אתכם עד המפתח';
const HIGHLIGHT = 'המפתח';
/** One entry per line: Satori would wrap pre-reversed text in the wrong order. */
const SUBLINE_LINES = ['שאלו כל שאלה על בניית בית', 'וקבלו תשובה מהשטח, תוך שניות'];
const TOPICS = ['סרטונים', 'פודקאסט', 'מדריכים', 'בעלי מקצוע'];

/** Heebo (the site face) from Google Fonts, subset to the glyphs we draw. */
async function loadHeebo(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Heebo:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

/** The owner's wordmark (public/brand/logo.svg), white with a magenta first letter. */
function Wordmark() {
  return (
    <svg width="266" height="64" viewBox="0 0 222 53" fill="#FFFFFF">
      <path d="M142.14 20.58V14.36H150.36V28.32H136.79V20.59H142.14Z" />
      <path d="M42.46 22.57H36.77V14.35H50.67V28.24H42.45V22.57Z" />
      <path d="M156.14 34.18H162.25V26.14C162.25 23.33 161.33 22.57 158.63 22.57H156.51V14.35H158.63C167.66 14.35 170.47 17.05 170.47 26.14L170.54 42.3H156.14V34.18Z" />
      <path fill={primary[500]} d="M192.42 34.18H210.6V26.14C210.6 23.33 209.68 22.57 206.98 22.57H193.07V14.35H206.98C216.01 14.35 218.82 17.05 218.82 26.14V34.18H221.25V42.3H192.42V34.18Z" />
      <path fill={primary[500]} d="M201.94 30.01C202.99 30.01 203.84 29.16 203.84 28.11C203.84 27.06 202.99 26.21 201.94 26.21C200.89 26.21 200.04 27.06 200.04 28.11C200.04 29.16 200.89 30.01 201.94 30.01Z" />
      <path d="M55.89 34.2H74.07V26.07C74.07 23.26 73.15 22.5 70.45 22.5H56.54V14.35H70.45C79.48 14.35 82.29 17.05 82.29 26.14V34.2H84.72V42.31H55.89V34.2Z" />
      <path d="M162.86 52.12C163.91 52.12 164.76 51.27 164.76 50.22C164.76 49.17 163.91 48.32 162.86 48.32C161.81 48.32 160.96 49.17 160.96 50.22C160.96 51.27 161.81 52.12 162.86 52.12Z" />
      <path d="M64.86 30.01C65.91 30.01 66.76 29.16 66.76 28.11C66.76 27.06 65.91 26.21 64.86 26.21C63.81 26.21 62.96 27.06 62.96 28.11C62.96 29.16 63.81 30.01 64.86 30.01Z" />
      <path d="M185.29 0H177.6V7.94H185.29V0Z" />
      <path d="M107.7 34.18V22.49H119.71C121.55 22.49 122.52 23.25 122.52 25.19V28.31H130.74V25.32C130.74 17.1 127.82 14.35 119.71 14.35H99.48V42.3H130.74V34.17H107.7V34.18Z" />
      <path d="M19.62 14.35H5.71V22.57H19.62C22.32 22.57 23.24 23.33 23.24 26.14V42.3H31.46V26.14C31.46 17.06 28.65 14.35 19.62 14.35Z" />
      <path d="M5.69 34.16H0V42.29H13.34V27.89H5.69V34.16Z" />
      <path d="M185.68 14.23H177.19V42.3H185.68V14.23Z" />
    </svg>
  );
}

export default async function Image() {
  const glyphs = `${HEADLINE}${SUBLINE_LINES.join('')}${TOPICS.join('')}·,${SITE_HOST}`;
  const [bold, regular, poster] = await Promise.all([
    loadHeebo(800, glyphs),
    loadHeebo(400, glyphs),
    fetch(new URL('../public/brand/tomer-trailer-poster.jpg', import.meta.url))
      .then((r) => r.arrayBuffer())
      .catch(() => null),
  ]);
  const fonts = [
    ...(bold ? [{ name: 'Heebo', data: bold, weight: 800 as const, style: 'normal' as const }] : []),
    ...(regular ? [{ name: 'Heebo', data: regular, weight: 400 as const, style: 'normal' as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: ink[950],
          backgroundImage: `radial-gradient(circle at 92% 0%, ${primary[600]}55 0%, transparent 45%), radial-gradient(circle at 0% 100%, ${primary[900]}aa 0%, transparent 50%)`,
          fontFamily: 'Heebo',
          padding: 56,
        }}
      >
        {/* Photo (left) */}
        {poster && (
          <div style={{ display: 'flex', width: 470, height: '100%', borderRadius: 36, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- satori image */}
            <img src={poster as unknown as string} width={470} height={518} style={{ objectFit: 'cover', width: 470, height: 518 }} />
          </div>
        )}

        {/* Copy (right), laid out for an LTR renderer */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', flex: 1, paddingLeft: 48 }}>
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.55)' }}>{SITE_HOST}</span>
            <Wordmark />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 22, fontSize: 92, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.05, letterSpacing: -2 }}>
              {visualWords(HEADLINE).map((w) => (
                <span key={w} style={{ color: w === visualHebrew(HIGHLIGHT) ? primary[500] : '#FFFFFF' }}>
                  {w}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: 22, fontSize: 31, fontWeight: 400, lineHeight: 1.45, color: 'rgba(255,255,255,0.78)' }}>
              {SUBLINE_LINES.map((line) => (
                <span key={line} style={{ whiteSpace: 'nowrap' }}>
                  {visualHebrew(line)}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', width: '100%', justifyContent: 'flex-end', fontSize: 24 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {[...TOPICS].reverse().map((t) => (
                <span
                  key={t}
                  style={{
                    display: 'flex',
                    padding: '8px 18px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    color: '#FFFFFF',
                  }}
                >
                  {visualHebrew(t)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
