// Översikten behöver ALLA pass i lätt form (streaks, belastning, kalender) men de tunga kolumnerna
// (pulszoner ur raw_data, beskrivning, namn, watt) bara för veckans pass och det senaste passet.
// Lätta kolumner för hela historiken + detaljer för några få rader ger samma resultat som förut
// med en bråkdel av datamängden. Se STATUS.md (CPU-arbetet).
export const OVERVIEW_LIGHT_COLUMNS =
  'id, strava_id, source, sport_type, distance, moving_time, average_heartrate, max_heartrate, start_date, calories'

export const OVERVIEW_DETAIL_COLUMNS =
  'id, name, average_watts, description, hr_zones:raw_data->hrZones'

// Marginal bakåt från veckostart: Garmin/Concept2 sparar klocktid som UTC (lib/wall-clock.ts), så
// en vecka kan börja upp till ett par timmar "tidigare" i databasen än i verkligheten.
export const DETAIL_WINDOW_MARGIN_MS = 24 * 3600 * 1000

export function mergeActivityDetails<L extends { id: string }, D extends { id: string }>(
  light: L[] | null,
  ...detailSets: (D[] | null)[]
): (L & Partial<Omit<D, 'id'>>)[] {
  const byId = new Map<string, D>()
  for (const set of detailSets) for (const d of set ?? []) byId.set(d.id, { ...byId.get(d.id), ...d })
  return (light ?? []).map(l => {
    const d = byId.get(l.id)
    return (d ? { ...l, ...d } : l) as L & Partial<Omit<D, 'id'>>
  })
}
