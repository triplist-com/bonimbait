import { ImageResponse } from 'next/og';
import { OG_BACKGROUND, OG_SIZE, OgLine, OgWordmark, ogFonts } from '@/components/pitch/og';
import { ink, primary } from '@/lib/design/tokens';
import { glyphsOf } from '@/lib/pitch/og-text';
import { TOUR_BEATS } from '@/lib/pitch/tour';

export const runtime = 'edge';

export const alt = 'הסיור: בונים בית OS ב-15 דקות, מהשאלה הראשונה ועד המפתח';
export const size = OG_SIZE;
export const contentType = 'image/png';

const TITLE = 'הסיור: 15 דקות';
const SUBTITLE = 'מהשאלה הראשונה ועד המפתח';
const NOTE = 'עשר תחנות · בנייד ובמחשב';

/** The link preview of /platform/tour/: the ten beats as a strip, phone beats in magenta. */
export default async function Image() {
  const fonts = await ogFonts(glyphsOf([TITLE, SUBTITLE, NOTE, 'OS0123456789']));
  const beats = [...TOUR_BEATS].map((b, i) => ({ ...b, n: i + 1 })).reverse();

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, fontFamily: 'Heebo', color: '#FFFFFF', ...OG_BACKGROUND }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <OgWordmark />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <OgLine text={TITLE} style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }} />
          <OgLine text={SUBTITLE} style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.2, marginTop: 6 }} highlight={() => true} />
          <OgLine text={NOTE} style={{ fontSize: 28, fontWeight: 400, marginTop: 18, color: 'rgba(255,255,255,0.75)' }} />
        </div>
        <div style={{ display: 'flex', gap: 4, height: 64, borderRadius: 16, overflow: 'hidden' }}>
          {beats.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex',
                flexGrow: b.to - b.from,
                flexBasis: 0,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 800,
                background: b.device === 'phone' ? primary[600] : 'rgba(255,255,255,0.88)',
                color: b.device === 'phone' ? '#FFFFFF' : ink[950],
              }}
            >
              {String(b.n)}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
