import { dedupeForStats, type ActivityRow } from './duplicates'

// "Vännerna": summering per vecka / månad / år. Veckan räknas som förut på servern
// (summarizeFriendWeek). Månader och år byggs här av ALLA pass som sidan redan hämtat
// (egna + vännernas hela historik) men skickas till webbläsaren som små förberäknade
// summor per person och månad — inte som tusentals rader. Ett år = summan av årets månader.
export type PeriodBucket = { sec: number; m: number; n: number }

export type PersonPeriods = {
  ownerId: string
  ownerName: string
  isSelf: boolean
  /** 'YYYY-MM' → summa. Saknad månad = inga pass. */
  months: Record<string, PeriodBucket>
}

type OwnedRow = ActivityRow & { owner_id: string }

export function monthKeyOf(startDate: string): string {
  return startDate.slice(0, 7)
}

export function buildPersonPeriods(
  rows: OwnedRow[],
  people: { ownerId: string; ownerName: string; isSelf: boolean }[],
): PersonPeriods[] {
  // Gruppera per person och månad och deduplicera inom gruppen — samma regel som
  // veckosummorna (en Garmin+Concept2-dubblett av samma rodd ska räknas en gång).
  const groups = new Map<string, OwnedRow[]>()
  for (const r of rows) {
    const key = `${r.owner_id}|${monthKeyOf(r.start_date)}`
    const list = groups.get(key)
    if (list) list.push(r); else groups.set(key, [r])
  }
  const byPerson = new Map<string, Record<string, PeriodBucket>>()
  for (const [key, list] of groups) {
    const [ownerId, month] = key.split('|')
    const deduped = dedupeForStats(list)
    const bucket: PeriodBucket = {
      sec: deduped.reduce((s, a) => s + a.moving_time, 0),
      m: deduped.reduce((s, a) => s + a.distance, 0),
      n: deduped.length,
    }
    const months = byPerson.get(ownerId) ?? {}
    months[month] = bucket
    byPerson.set(ownerId, months)
  }
  return people.map(p => ({ ...p, months: byPerson.get(p.ownerId) ?? {} }))
}

export type PeriodSelection = { kind: 'month'; key: string } | { kind: 'year'; key: string }

export type PeriodRow = { ownerId: string; ownerName: string; isSelf: boolean; sec: number; m: number; n: number }

// Summerar vald månad ('YYYY-MM') eller år ('YYYY') per person, mest aktiv först.
export function totalsForPeriod(people: PersonPeriods[], sel: PeriodSelection): PeriodRow[] {
  return people
    .map(p => {
      let sec = 0, m = 0, n = 0
      for (const [month, b] of Object.entries(p.months)) {
        if (sel.kind === 'month' ? month === sel.key : month.startsWith(`${sel.key}-`)) { sec += b.sec; m += b.m; n += b.n }
      }
      return { ownerId: p.ownerId, ownerName: p.ownerName, isSelf: p.isSelf, sec, m, n }
    })
    .sort((a, b) => b.sec - a.sec)
}

// Månader/år som någon har pass i, nyast först, alltid inklusive innevarande.
export function availablePeriods(people: PersonPeriods[], todayKey: string): { months: string[]; years: string[] } {
  const months = new Set<string>([todayKey.slice(0, 7)])
  for (const p of people) for (const k of Object.keys(p.months)) months.add(k)
  const sorted = [...months].sort().reverse()
  const years = [...new Set(sorted.map(m => m.slice(0, 4)))]
  return { months: sorted, years }
}
