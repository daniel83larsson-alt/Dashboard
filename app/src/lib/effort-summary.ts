import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateZones, ZONE_LABELS, type ZoneSummary } from './zones'
import { sportLabel } from './sport'

// Daniel: "i båda recap månad och vecka, velat få feedback på vilka zoner mm
// som varit dominerande i ens träning ... Har vi begreppet training effort på
// våra pass?" — pulszoner (tid i zon) + Garmins Träningseffekt (aerob/anaerob,
// 0–5, samma värden som visas på passidan). Ren uträkning; hämtningen ligger
// i fetchEffortRows nedan. Ingen bedömning mot ett facit (t.ex. 80/20) —
// bara en beskrivning av vad som körts.

// Daniel's watch can't produce Garmin's Training Effect, so for passes that
// have pulszoner but no Garmin value we ESTIMATE the aerobic effect (0–5):
// zone-weighted minutes, saturating towards 5. Weights/constant were fit
// against 218 real Garmin passes that have both zones and Garmin's own value
// (correlation 0.92, mean absolute error 0.37, no bias) — an estimate, never
// presented as Garmin's number. Anaerobic is not estimated.
const ZONE_WEIGHTS = [1, 2, 4, 7, 10] // per minute in zone 1..5
const SATURATION_MIN = 135
const MIN_ESTIMATE_SECS = 300

export function estimateAerobicTE(hrZones: unknown): number | null {
  if (!Array.isArray(hrZones)) return null
  let secs = 0
  let score = 0
  for (const z of hrZones as { zoneNumber?: number; secsInZone?: number }[]) {
    const w = ZONE_WEIGHTS[(z.zoneNumber ?? 0) - 1]
    const t = z.secsInZone ?? 0
    if (w == null || !(t > 0)) continue
    secs += t
    score += (t / 60) * w
  }
  if (secs < MIN_ESTIMATE_SECS) return null
  return Math.round(5 * (1 - Math.exp(-score / SATURATION_MIN)) * 10) / 10
}

export type EffortRow = {
  id: string
  sport_type: string
  start_date: string
  hr_zones?: unknown
  aerobic_te?: unknown
  anaerobic_te?: unknown
}

export type EffortSummary = {
  zones: ZoneSummary[] // empty when no pass had zone data
  zonePasses: number // passes that had zone data ("baserat på X av Y pass")
  totalPasses: number
  teAvgAerobic: number | null // Garmin Training Effect 0–5
  teAvgAnaerobic: number | null
  tePasses: number
  teEstimatedPasses?: number // how many of tePasses are our own zone-based estimate (no Garmin value)
  hardest: { activityId: string; sport: string; label: string; startDate: string; aerobic: number | null; anaerobic: number | null; estimated?: boolean } | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round1 = (n: number) => Math.round(n * 10) / 10

// totalPasses = deduped sessions in the period (the "Y" in "X av Y pass");
// rows may include a Garmin+Concept2 pair, but only the Garmin side carries
// zones/effect, so each real session is counted once for X.
export function computeEffortSummary(rows: EffortRow[], totalPasses: number): EffortSummary | null {
  const zoneRows = rows.filter(r => Array.isArray(r.hr_zones))
  const zones = aggregateZones(zoneRows)
  const teRows = rows
    .map(r => {
      const garminAero = num(r.aerobic_te)
      const garminAnaero = num(r.anaerobic_te)
      if (garminAero != null || garminAnaero != null) return { r, aero: garminAero, anaero: garminAnaero, estimated: false }
      // No Garmin value → our own estimate from the pass's zones (aerobic only).
      const est = estimateAerobicTE(r.hr_zones)
      return { r, aero: est, anaero: null as number | null, estimated: est != null }
    })
    .filter(x => x.aero != null || x.anaero != null)
  if (zones.length === 0 && teRows.length === 0) return null

  const avgOf = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null)
    return v.length ? round1(v.reduce((s, x) => s + x, 0) / v.length) : null
  }
  const hardestRow = teRows.reduce<(typeof teRows)[number] | null>((best, x) => {
    const score = (x.aero ?? 0)
    return !best || score > (best.aero ?? 0) ? x : best
  }, null)

  return {
    zones,
    zonePasses: zoneRows.length,
    totalPasses: Math.max(totalPasses, zoneRows.length),
    teAvgAerobic: avgOf(teRows.map(x => x.aero)),
    teAvgAnaerobic: avgOf(teRows.map(x => x.anaero)),
    tePasses: teRows.length,
    teEstimatedPasses: teRows.filter(x => x.estimated).length,
    hardest: hardestRow
      ? { activityId: hardestRow.r.id, sport: hardestRow.r.sport_type, label: sportLabel(hardestRow.r.sport_type), startDate: hardestRow.r.start_date, aerobic: hardestRow.aero, anaerobic: hardestRow.anaero, estimated: hardestRow.estimated }
      : null,
  }
}

// Honest source label: Garmin's own value, our estimate from zones, or a mix.
export function teSourceLabel(e: Pick<EffortSummary, 'tePasses' | 'teEstimatedPasses'>): string {
  const est = e.teEstimatedPasses ?? 0
  if (est === 0) return 'Garmin'
  return est >= e.tePasses ? 'uppskattad av appen från pulszoner, inte Garmins värde' : 'delvis Garmin, delvis uppskattad från pulszoner'
}

// One compact line block for the AI prompt (weekly + monthly share it).
export function effortPromptLines(e: EffortSummary): string[] {
  const lines: string[] = []
  if (e.zones.length) {
    lines.push(`ZONFÖRDELNING (tid i pulszon, baserat på ${e.zonePasses} av ${e.totalPasses} pass): ${e.zones.map(z => `${ZONE_LABELS[z.zoneNumber - 1]?.split(' · ')[0] ?? `Zon ${z.zoneNumber}`} ${z.pct} %`).join(', ')}`)
  }
  if (e.tePasses > 0) {
    const parts = [`snitt aerob ${e.teAvgAerobic ?? '–'}`]
    if (e.teAvgAnaerobic != null) parts.push(`anaerob ${e.teAvgAnaerobic}`)
    const h = e.hardest
    const hard = h ? `; hårdaste passet: ${h.label} ${h.startDate.slice(0, 10)}, aerob ${h.aerobic ?? '–'}${h.anaerobic != null ? `, anaerob ${h.anaerobic}` : ''}` : ''
    lines.push(`TRÄNINGSEFFEKT (${teSourceLabel(e)}, skala 0–5, ${e.tePasses} av ${e.totalPasses} pass): ${parts.join(', ')}${hard}`)
  }
  return lines
}

// Only this period's rows (not full history) with just the three json paths
// needed, so the bulk query never drags whole raw_data blobs along.
export async function fetchEffortRows(supabase: SupabaseClient, userId: string, fromIso: string, toExclusiveIso: string): Promise<EffortRow[]> {
  const { data } = await supabase.from('activities')
    .select('id, sport_type, start_date, hr_zones:raw_data->hrZones, aerobic_te:raw_data->aerobicTrainingEffect, anaerobic_te:raw_data->anaerobicTrainingEffect')
    .eq('user_id', userId).gte('start_date', fromIso).lt('start_date', toExclusiveIso)
  return (data ?? []) as unknown as EffortRow[]
}
