export const SYNC_STORAGE_KEY = 'dl-last-sync'
// 3 h: Garmin/Concept2 synkas redan varje natt (cron) och via knappen "Synka nu". En timme gav
// ~12 synkar/dygn och två fulla sidräkningar per besök — onödig serverbelastning (Vercels
// gratisgräns för aktiv CPU) och onödig belastning på Garmins inofficiella API.
export const MIN_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000

function positive(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return typeof v === 'number' && v > 0
}

// Sant om en synk faktiskt ändrade något som syns på sidan (nya/uppdaterade pass,
// bakfyllda dagar/zoner, städade dubbletter). Annars behövs ingen ny sidräkning —
// förut laddades hela Översikt om efter varje synk, även när inget nytt kom.
export function syncChangedData(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const r = result as Record<string, unknown>
  return ['synced', 'backfilled', 'activitiesBackfilled', 'cleaned', 'reclassified', 'zonesBackfilled'].some(k => positive(r[k]))
}
