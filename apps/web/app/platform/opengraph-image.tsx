import { ImageResponse } from 'next/og';
import { OG_BACKGROUND, OG_SIZE, OgLine, OgWordmark, ogFonts } from '@/components/pitch/og';
import { advisorName } from '@/lib/nav';
import { glyphsOf, visualTokens } from '@/lib/pitch/og-text';

export const runtime = 'edge';

export const alt = 'בונים בית OS: כל שאלה של בונה — לקוח שלכם';
export const size = OG_SIZE;
export const contentType = 'image/png';

const LINE_1 = 'כל שאלה של בונה —';
const LINE_2 = 'לקוח שלכם.';
const TAGLINE = 'בונים בית OS — מהשאלה הראשונה ועד המפתח';
const CHIPS = [advisorName(), 'הבית שלי', 'חדר הבקרה', 'דוח שותף'];

/** The link preview of /platform/ (sent to the owner on WhatsApp). */
export default async function Image() {
  const fonts = await ogFonts(glyphsOf([LINE_1, LINE_2, TAGLINE, ...CHIPS, 'OS']));
  const poster = await fetch(new URL('../../public/brand/tomer-trailer-poster.jpg', import.meta.url))
    .then((r) => r.arrayBuffer())
    .catch(() => null);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', padding: 56, fontFamily: 'Heebo', ...OG_BACKGROUND }}>
        {poster && (
          <div style={{ display: 'flex', width: 400, height: '100%', borderRadius: 36, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- satori image */}
            <img src={poster as unknown as string} width={400} height={518} style={{ objectFit: 'cover', width: 400, height: 518 }} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', flex: 1, paddingLeft: 48, color: '#FFFFFF' }}>
          <OgWordmark />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <OgLine text={LINE_1} style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }} />
            <OgLine text={LINE_2} style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }} highlight={() => true} />
            <OgLine text={TAGLINE} style={{ marginTop: 24, fontSize: 30, fontWeight: 400, color: 'rgba(255,255,255,0.8)' }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[...CHIPS].reverse().map((chip) => (
              <div
                key={chip}
                style={{
                  display: 'flex',
                  gap: '0.26em',
                  padding: '8px 18px',
                  borderRadius: 999,
                  fontSize: 22,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.16)',
                }}
              >
                {visualTokens(chip).map((t) => (
                  <span key={t.index}>{t.text}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
