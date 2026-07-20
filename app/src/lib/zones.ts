export const ZONE_COLORS = ['#6b7280', '#a7bda9', '#ccd400', '#e0a83a', '#e0543a']
export const ZONE_LABELS = ['Zon 1 · Uppvärmning', 'Zon 2 · Lätt', 'Zon 3 · Måttlig', 'Zon 4 · Hård', 'Zon 5 · Max']

export type HrZone = { zoneNumber: number; secsInZone: number }
export type ZoneSummary = { zoneNumber: number; secs: number; pct: number }

function summarize(totals: Map<number, number>): ZoneSummary[] {
  const grandTotal = [...totals.values()].reduce((s, v) => s + v, 0)
  if (grandTotal === 0) return []
  return [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([zoneNumber, secs]) => ({ zoneNumber, secs, pct: Math.round((secs / grandTotal) * 100) }))
}

// Sums seconds-in-zone across many activities' cached Garmin HR-zone data
// (hr_zones — populated on-demand when a pass is opened, or by the gradual
// sync backfill — selected as `hr_zones:raw_data->hrZones` by callers
// rather than the full raw_data column, since a bulk activity list can't
// afford to carry each row's whole cached API response along for this).
export function aggregateZones(rows: { hr_zones?: unknown }[]): ZoneSummary[] {
  const totals = new Map<number, number>()
  for (const row of rows) {
    const zones = row.hr_zones as HrZone[] | undefined
    if (!Array.isArray(zones)) continue
    for (const z of zones) {
      totals.set(z.zoneNumber, (totals.get(z.zoneNumber) ?? 0) + (z.secsInZone ?? 0))
    }
  }
  return summarize(totals)
}

// Same shape, for a single activity's own zone list (activity detail page).
export function zonesToSummary(zones: HrZone[]): ZoneSummary[] {
  const totals = new Map<number, number>()
  for (const z of zones) totals.set(z.zoneNumber, (totals.get(z.zoneNumber) ?? 0) + (z.secsInZone ?? 0))
  return summarize(totals)
}

// How many of the given activities actually have cached zone data — used to
// show "based on X of Y passes" since coverage fills in gradually.
export function zoneCoverageCount(rows: { hr_zones?: unknown }[]): number {
  return rows.filter(r => Array.isArray(r.hr_zones)).length
}
