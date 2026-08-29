import { ImageResponse } from 'next/og'

export const alt = 'DL Trainer — Din AI-tränare, dygnet runt'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Ingen egen font angiven — next/og:s inbyggda Geist-fallback täcker å/ä/ö
// fint, så vi slipper hämta/bädda in ett typsnitt bara för den här bilden.
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0e1113',
          backgroundImage: 'radial-gradient(ellipse 900px 500px at 15% -10%, rgba(204,212,0,.22), transparent 60%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#ccd400',
              color: '#12140a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            DL
          </div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#e8ecef' }}>
            DL <span style={{ color: '#ccd400', marginLeft: 12 }}>Trainer</span>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: '#e8ecef', marginTop: 48, maxWidth: 900, lineHeight: 1.15 }}>
          Din tränare, dygnet runt.
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#8899a0', marginTop: 20, maxWidth: 820 }}>
          En AI-coach per sportgren. Kopplat till Garmin, Concept2, Strava och Polar.
        </div>
      </div>
    ),
    { ...size }
  )
}
