import { stockholmDateKey } from './dates'

// Daniel: "Tiderna här, är de när passet synkas eller när de utfördes?" — de
// visade passens starttid två timmar för sent. Orsak: Garmin och Concept2
// skickar starttiden som lokal klocktid ("2026-10-02 09:41:50"), och synken
// sparar den som om den vore UTC (start_date = 09:41+00). Klocktiden i
// databasen ÄR alltså redan svensk tid; att låta webbläsaren "översätta" den
// från UTC lade på +2 h (sommartid). Passidan visade rätt (servern kör UTC),
// väninflödet visade fel (webbläsarens tidszon).
//
// Läser därför klockslaget rakt av (UTC-fälten) för källor som lagrar
// klocktid, och räknar vanlig tidszonsomvandling bara för äkta tidpunkter.
// Datum/tid sparas inte om i databasen — dagsgruppering, dubblettdetektering
// och rekord bygger på det värdet.
const WALL_CLOCK_SOURCES = new Set(['garmin', 'concept2'])

export function activityWallClock(iso: string, source?: string | null): { dateKey: string; time: string } {
  const d = new Date(iso)
  if (source && WALL_CLOCK_SOURCES.has(source)) {
    const p = (n: number) => String(n).padStart(2, '0')
    return { dateKey: d.toISOString().slice(0, 10), time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` }
  }
  return {
    dateKey: stockholmDateKey(d),
    time: d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }),
  }
}

// "Idag kl. 09:41" / "Igår kl. …" / "2 okt kl. …" — jämför mot dagens datum i Stockholm.
export function fmtActivityWhen(iso: string, source: string | null | undefined, now: Date = new Date()): string {
  const { dateKey, time } = activityWallClock(iso, source)
  const today = stockholmDateKey(now)
  if (dateKey === today) return `Idag kl. ${time}`
  const y = new Date(`${today}T12:00:00Z`)
  y.setUTCDate(y.getUTCDate() - 1)
  if (dateKey === y.toISOString().slice(0, 10)) return `Igår kl. ${time}`
  const label = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${label} kl. ${time}`
}
