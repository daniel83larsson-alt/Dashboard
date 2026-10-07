import { dedupeForStats, type ActivityRow } from './duplicates'
import { TIME_WINDOWS, PR_ELIGIBLE_SPORTS, RECORD_MARGIN_PCT, benchmarksForSport } from './records'

// Ren motor för "vilka pass slog ett rekord" och månadssummor — ingen I/O.
//
// Tidigare räknades rekordmärken om mot HELA historiken varje gång någon tittade (för varje
// vän, vid varje sidvisning). Nu räknas de en gång när passen ändras (se records-store.ts) och
// sparas i tabeller; sidorna läser bara resultatet.
//
// Definitionen är densamma som förut (records.ts newRecordsForLatest): ett pass jämförs bara med
// SAMMA persons tidigare pass (strikt tidigare starttid) och måste slå förra bästa med minst
// RECORD_MARGIN_PCT. Här görs det i ETT svep i tidsordning med löpande bästavärden i stället för
// att filtrera hela historiken för varje pass. records-engine.test.ts kontrollerar att svepet ger
// exakt samma märken som den gamla funktionen på slumpade historiker.

type Bests = {
  /** sport → fönsteretikett → längsta distans (m) */
  win: Map<string, Map<string, number>>
  /** sport → distansetikett → kortaste tid (s) */
  bench: Map<string, Map<string, number>>
  /** längsta passet (s) över alla sporter, bara pass ≥ 60 s */
  longest: number | undefined
}

function sub<V>(m: Map<string, Map<string, V>>, sport: string): Map<string, V> {
  let x = m.get(sport)
  if (!x) { x = new Map(); m.set(sport, x) }
  return x
}

function evaluate(s: ActivityRow, b: Bests): string[] {
  const hits: string[] = []
  const sport = s.sport_type
  if (PR_ELIGIBLE_SPORTS.has(sport) && s.distance >= 200 && s.moving_time >= 60) {
    const win = b.win.get(sport)
    for (const w of TIME_WINDOWS) {
      if (s.moving_time < w.minSec || s.moving_time > w.maxSec) continue
      const prior = win?.get(w.label)
      if (prior === undefined) continue
      if (s.distance * 100 >= prior * (100 + RECORD_MARGIN_PCT)) hits.push(`Bäst ${w.label}`)
    }
    const bench = b.bench.get(sport)
    for (const bm of benchmarksForSport(sport)) {
      if (s.distance < bm.meters * 0.96 || s.distance > bm.meters * 1.04) continue
      const prior = bench?.get(bm.label)
      if (prior === undefined) continue
      if (s.moving_time * 100 <= prior * (100 - RECORD_MARGIN_PCT)) hits.push(`Snabbaste ${bm.label}`)
    }
  }
  if (s.moving_time >= 60 && b.longest !== undefined) {
    if (s.moving_time * 100 >= b.longest * (100 + RECORD_MARGIN_PCT)) hits.push('Längsta passet någonsin')
  }
  return hits
}

function absorb(s: ActivityRow, b: Bests) {
  const sport = s.sport_type
  for (const w of TIME_WINDOWS) {
    if (s.moving_time >= w.minSec && s.moving_time <= w.maxSec && s.distance >= 200) {
      const m = sub(b.win, sport)
      m.set(w.label, Math.max(m.get(w.label) ?? -Infinity, s.distance))
    }
  }
  for (const bm of benchmarksForSport(sport)) {
    if (s.distance >= bm.meters * 0.96 && s.distance <= bm.meters * 1.04) {
      const m = sub(b.bench, sport)
      m.set(bm.label, Math.min(m.get(bm.label) ?? Infinity, s.moving_time))
    }
  }
  if (s.moving_time >= 60) b.longest = Math.max(b.longest ?? -Infinity, s.moving_time)
}

/** Verkliga pass (Garmin+Concept2-dubbletter ihopslagna) i tidsordning, äldst först. */
export function sessionsOf<T extends ActivityRow>(rows: T[]): T[] {
  return dedupeForStats(rows).sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date) || a.id.localeCompare(b.id))
}

/** pass-id → rekordetiketter. Pass utan rekord saknas. `sessions` ska komma från sessionsOf(). */
export function recordLabelsBySession(sessions: ActivityRow[]): Map<string, string[]> {
  const bests: Bests = { win: new Map(), bench: new Map(), longest: undefined }
  const out = new Map<string, string[]>()
  let i = 0
  while (i < sessions.length) {
    // Pass med exakt samma starttid räknas inte som "tidigare" än varandra — utvärdera hela gruppen
    // mot bästavärdena FÖRE gruppen, lägg sedan till gruppen.
    const t = Date.parse(sessions[i].start_date)
    let j = i
    while (j < sessions.length && Date.parse(sessions[j].start_date) === t) j++
    for (let k = i; k < j; k++) {
      const hits = evaluate(sessions[k], bests)
      if (hits.length) out.set(sessions[k].id, hits)
    }
    for (let k = i; k < j; k++) absorb(sessions[k], bests)
    i = j
  }
  return out
}

export type MonthBucket = { sec: number; m: number; n: number }

/** 'YYYY-MM' → summa, på verkliga pass (samma regel som vännernas månadsvy tidigare). */
export function monthlyTotals(sessions: ActivityRow[]): Record<string, MonthBucket> {
  const out: Record<string, MonthBucket> = {}
  for (const s of sessions) {
    const key = s.start_date.slice(0, 7)
    const b = (out[key] ??= { sec: 0, m: 0, n: 0 })
    b.sec += s.moving_time
    b.m += s.distance
    b.n += 1
  }
  return out
}
