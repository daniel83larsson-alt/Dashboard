import { computeStreakBadge, type StreakBadgeTier } from '@/lib/streak-badge'

// Daniel: "gillar idén där att den lyser upp/laddas upp ju mer man kört" —
// samma ikon genom hela nivån, men ringen runt fylls på och färgen värms
// mot guld ju närmare nästa nivå (5→25→100→365, se lib/streak-badge.ts).
// Ren SSR-vänlig komponent (inga hooks) eftersom Översikt redan är en
// server-komponent och det här bara är statisk grafik, ingen interaktion.
const MUTED = '#8b9296'
const ACCENT = '#ccd400'
const GOLD = '#ffd84a'
const TRACK = '#242a2d'

function TierIcon({ tier, color }: { tier: StreakBadgeTier; color: string }) {
  if (tier === 'medal') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path d="M8 12 L4.5 22 L12 18.5 L19.5 22 L16 12" fill={color} opacity="0.3" />
        <circle cx="12" cy="9.5" r="7.5" fill={color} />
      </svg>
    )
  }
  if (tier === 'trophy') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path d="M6.5 3h11v3.5a5.5 5.5 0 0 1-5.5 5.5 5.5 5.5 0 0 1-5.5-5.5V3z" fill={color} />
        <path d="M6.5 4.3H4a2.6 2.6 0 0 0 2.5 2.6M17.5 4.3H20a2.6 2.6 0 0 1-2.5 2.6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        <rect x="10.8" y="12" width="2.4" height="3.4" fill={color} />
        <rect x="7.5" y="15.6" width="9" height="2.2" rx="1" fill={color} />
      </svg>
    )
  }
  if (tier === 'crown') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <defs>
          <linearGradient id="streakBadgeCrownGrad" x1="0" y1="0" x2="24" y2="20">
            <stop offset="0" stopColor="#ffd84a" />
            <stop offset="1" stopColor="#ccd400" />
          </linearGradient>
        </defs>
        <path d="M3.5 9.5l3.5 2.6L12 6.5l5 5.6 3.5-2.6-1.8 8.7H5.3L3.5 9.5z" fill="url(#streakBadgeCrownGrad)" />
        <circle cx="7.3" cy="10.3" r="1.1" fill="#fff" opacity="0.75" />
        <circle cx="12" cy="7.8" r="1.1" fill="#fff" opacity="0.75" />
        <circle cx="16.7" cy="10.3" r="1.1" fill="#fff" opacity="0.75" />
        <rect x="5.3" y="18.5" width="13.4" height="2" rx="1" fill="url(#streakBadgeCrownGrad)" />
      </svg>
    )
  }
  // ring — startnivån, innan första riktiga pokalen
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="2.4" fill={color} />
    </svg>
  )
}

export default function StreakBadge({ value, size = 30 }: { value: number; size?: number }) {
  const { tier, chargePct } = computeStreakBadge(value)
  const deg = Math.round(chargePct * 360)
  // Värms mot guld när du börjar närma dig nästa nivå — samma "nästan där"-
  // känsla som demon Daniel godkände, utan att behöva en full färgövertoning.
  const hot = tier !== 'crown' && chargePct >= 0.75
  const color = tier === 'crown' || hot ? GOLD : tier === 'ring' ? MUTED : ACCENT
  const glowRgb = tier === 'crown' || hot ? '255,216,74' : tier === 'ring' ? '139,146,150' : '204,212,0'
  const glowAlpha = tier === 'crown' ? 0.5 : chargePct === 0 ? 0 : Math.min(0.5, 0.12 + chargePct * 0.38)

  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        padding: 3,
        background: `conic-gradient(${color} ${deg}deg, ${TRACK} ${deg}deg 360deg)`,
        boxShadow: glowAlpha > 0 ? `0 0 ${8 + chargePct * 14}px rgba(${glowRgb},${glowAlpha})` : undefined,
      }}
    >
      <span className="flex items-center justify-center rounded-full w-full h-full bg-bg">
        <TierIcon tier={tier} color={color} />
      </span>
    </span>
  )
}
