'use client'

import { useMemo, useState } from 'react'
import { availablePeriods, totalsForPeriod, type PersonPeriods } from '@/lib/friend-period'

type WeekRow = { ownerId: string; ownerName: string; isSelf: boolean; activityCount: number; totalMovingTimeSec: number; totalDistanceM: number }
type Tab = 'week' | 'month' | 'year'

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }
function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}
function monthLabel(key: string) {
  const label = new Date(`${key}-01T00:00:00`).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Vännernas summering: Vecka (som förut, standard), Månad (välj månad) och År (välj år).
// Veckan kommer färdigräknad från servern. Månad/år summeras här av små förberäknade
// summor per person och månad (se lib/friend-period.ts) — `people` är null om vännernas
// historik inte gick att hämta fullständigt, då visas bara veckan i stället för fel siffror.
export default function FriendPeriodCard({ weekRows, people, todayKey }: { weekRows: WeekRow[]; people: PersonPeriods[] | null; todayKey: string }) {
  const [tab, setTab] = useState<Tab>('week')
  const available = useMemo(() => (people ? availablePeriods(people, todayKey) : null), [people, todayKey])
  const [month, setMonth] = useState(todayKey.slice(0, 7))
  const [year, setYear] = useState(todayKey.slice(0, 4))

  const rows = useMemo(() => {
    if (tab === 'week' || !people) {
      return weekRows.map(r => ({ ownerId: r.ownerId, ownerName: r.ownerName, isSelf: r.isSelf, n: r.activityCount, sec: r.totalMovingTimeSec, m: r.totalDistanceM }))
    }
    return totalsForPeriod(people, tab === 'month' ? { kind: 'month', key: month } : { kind: 'year', key: year })
  }, [tab, people, weekRows, month, year])

  const tabs: { id: Tab; label: string }[] = [{ id: 'week', label: 'Vecka' }, ...(people ? [{ id: 'month' as Tab, label: 'Månad' }, { id: 'year' as Tab, label: 'År' }] : [])]

  const monthIdx = available ? available.months.indexOf(month) : -1
  function stepMonth(delta: number) {
    if (!available) return
    const next = available.months[monthIdx - delta] // listan är nyast först
    if (next) setMonth(next)
  }
  const yearIdx = available ? available.years.indexOf(year) : -1
  function stepYear(delta: number) {
    if (!available) return
    const next = available.years[yearIdx - delta]
    if (next) setYear(next)
  }

  const heading = tab === 'week' ? 'Vänner denna vecka' : tab === 'month' ? `Vänner · ${monthLabel(month)}` : `Vänner · ${year}`

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs text-muted uppercase tracking-wider">{heading}</div>
        <div role="tablist" aria-label="Period" className="flex bg-bg border border-edge rounded-lg p-0.5 text-xs">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 rounded-md transition-colors ${tab === t.id ? 'bg-accent text-bg font-semibold' : 'text-muted hover:text-fg'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'month' && available && (
        <div className="flex items-center gap-2 mb-3">
          <button type="button" aria-label="Föregående månad" onClick={() => stepMonth(-1)} disabled={monthIdx >= available.months.length - 1} className="w-8 h-8 rounded-lg border border-edge text-muted disabled:opacity-30">‹</button>
          <select aria-label="Välj månad" value={month} onChange={e => setMonth(e.target.value)} className="flex-1 bg-bg border border-edge rounded-lg px-2 py-1.5 text-sm text-fg">
            {available.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button type="button" aria-label="Nästa månad" onClick={() => stepMonth(1)} disabled={monthIdx <= 0} className="w-8 h-8 rounded-lg border border-edge text-muted disabled:opacity-30">›</button>
        </div>
      )}
      {tab === 'year' && available && (
        <div className="flex items-center gap-2 mb-3">
          <button type="button" aria-label="Föregående år" onClick={() => stepYear(-1)} disabled={yearIdx >= available.years.length - 1} className="w-8 h-8 rounded-lg border border-edge text-muted disabled:opacity-30">‹</button>
          <select aria-label="Välj år" value={year} onChange={e => setYear(e.target.value)} className="flex-1 bg-bg border border-edge rounded-lg px-2 py-1.5 text-sm text-fg">
            {available.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" aria-label="Nästa år" onClick={() => stepYear(1)} disabled={yearIdx <= 0} className="w-8 h-8 rounded-lg border border-edge text-muted disabled:opacity-30">›</button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map(f => (
          <div key={f.ownerId} className="flex items-center justify-between text-sm">
            <span className={f.isSelf ? 'text-accent font-semibold' : 'text-fg'}>{f.ownerName}</span>
            <span className={`font-mono text-xs ${f.isSelf ? 'text-accent' : 'text-muted'}`}>
              {f.n} pass · {fmtDur(f.sec)}{f.m > 0 ? ` · ${fmtKm(f.m)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
