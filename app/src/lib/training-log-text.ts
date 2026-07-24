// Plain-text training log, grouped by ISO (Monday-start) week — meant to be
// copy-pasted into an external AI chat for context, not rendered in the app
// itself. Reuses the same one-real-session-per-day dedup as every other
// stats view (Rekord, Passlogg totals) so the numbers match what's shown
// elsewhere in the app.
import type { ActivityRow } from './duplicates'
import { dedupeForStats } from './duplicates'
import { sportLabel, usesDistance } from './sport'
import { startOfWeek } from './dates'

function fmtKm(m: number): string {
  return (m / 1000).toFixed(1).replace('.', ',') + ' km'
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h > 0) return `${h}t ${m}min`
  return `${m} min`
}

const WEEKDAY_SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

function fmtDayDate(d: Date): string {
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function fmtHeaderDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtWeekRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  const startStr = sameMonth ? `${monday.getDate()}` : `${monday.getDate()}/${monday.getMonth() + 1}`
  const endStr = `${sunday.getDate()}/${sunday.getMonth() + 1} ${sunday.getFullYear()}`
  return `${startStr}–${endStr}`
}

export function buildTrainingLogText(activities: ActivityRow[], weeks: number, now: Date = new Date()): string {
  const sessions = dedupeForStats(activities).slice().sort((a, b) => a.start_date.localeCompare(b.start_date))

  const cutoff = startOfWeek(now)
  cutoff.setDate(cutoff.getDate() - (weeks - 1) * 7)

  const inRange = sessions.filter(a => new Date(a.start_date) >= cutoff)
  if (inRange.length === 0) {
    return `Inga loggade pass de senaste ${weeks} veckorna.`
  }

  const byWeek = new Map<string, { monday: Date; rows: ActivityRow[] }>()
  for (const a of inRange) {
    const monday = startOfWeek(new Date(a.start_date))
    const key = monday.toISOString().slice(0, 10)
    if (!byWeek.has(key)) byWeek.set(key, { monday, rows: [] })
    byWeek.get(key)!.rows.push(a)
  }

  const weekKeys = [...byWeek.keys()].sort()
  const totalKm = inRange.reduce((s, a) => s + (a.distance ?? 0), 0)
  const totalTime = inRange.reduce((s, a) => s + (a.moving_time ?? 0), 0)

  const lines: string[] = []
  lines.push(`Träningslogg — ${weeks} veckor tillbaka (${fmtHeaderDate(cutoff)} – ${fmtHeaderDate(now)})`)
  lines.push(`${inRange.length} pass totalt · ${fmtKm(totalKm)} · ${fmtDur(totalTime)}`)
  lines.push('')

  for (const key of weekKeys) {
    const { monday, rows } = byWeek.get(key)!
    lines.push(`Vecka ${fmtWeekRange(monday)} — ${rows.length} pass`)
    for (const a of rows.slice().sort((x, y) => x.start_date.localeCompare(y.start_date))) {
      const d = new Date(a.start_date)
      const parts = [fmtDayDate(d), sportLabel(a.sport_type)]
      if (usesDistance(a.sport_type) && a.distance > 0) parts.push(fmtKm(a.distance))
      parts.push(fmtDur(a.moving_time))
      if (a.name) parts.push(a.name)
      lines.push(`- ${parts.join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}
