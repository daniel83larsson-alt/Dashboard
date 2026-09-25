// Streak-badge på Översikt: samma pokal-ikon genom hela nivån, men en ring
// runt den laddas upp och glöder starkare ju närmare du kommer nästa nivå
// — Daniel: "gillar idén där att den lyser upp/laddas upp ju mer man kört."
// Nivågränserna (0/25/100/365) är fyra av talen som redan finns i
// lib/milestones.ts MILESTONES — bara ett urval av dem blir en egen ikon,
// mellanliggande milstolpar (5/7/10/14/21/30/50/52 osv.) fortsätter fira med
// den befintliga banderollen precis som innan, den här badgen ändrar inget
// i den logiken.
export type StreakBadgeTier = 'ring' | 'medal' | 'trophy' | 'crown'

export type StreakBadge = {
  tier: StreakBadgeTier
  // 0–1, hur långt in i den aktuella nivån strecket är. Alltid 1 på den
  // högsta nivån (crown) — inget tak att ladda mot än.
  chargePct: number
}

const TIERS: { floor: number; ceil: number | null; tier: StreakBadgeTier }[] = [
  { floor: 0, ceil: 25, tier: 'ring' },
  { floor: 25, ceil: 100, tier: 'medal' },
  { floor: 100, ceil: 365, tier: 'trophy' },
  { floor: 365, ceil: null, tier: 'crown' },
]

export function computeStreakBadge(value: number): StreakBadge {
  const v = Math.max(0, value)
  const t = TIERS.find(t => t.ceil == null || v < t.ceil) ?? TIERS[TIERS.length - 1]
  const chargePct = t.ceil == null ? 1 : Math.min(1, (v - t.floor) / (t.ceil - t.floor))
  return { tier: t.tier, chargePct }
}
