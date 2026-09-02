'use client'

import { useState } from 'react'
import type { WeeklyDigestRecord } from '@/lib/weekly-digest-generate'

type DigestRecord = WeeklyDigestRecord

function fmtDateRange(startISO: string, endISO: string) {
  const start = new Date(`${startISO}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  const end = new Date(`${endISO}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  return `${start} – ${end}`
}

function Delta({ current, prev, unit = '' }: { current: number; prev: number; unit?: string }) {
  const diff = current - prev
  if (Math.abs(diff) < 0.05) return <span className="text-muted text-xs">samma som förra veckan</span>
  const up = diff > 0
  return (
    <span className={`text-xs ${up ? 'text-accent' : 'text-muted'}`}>
      {up ? '+' : ''}{diff % 1 === 0 ? diff : diff.toFixed(1)}{unit} mot förra veckan
    </span>
  )
}

export default function WeeklyDigestCard({ initialRecord }: { initialRecord: DigestRecord | null }) {
  const [record, setRecord] = useState(initialRecord)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/weekly-digest/generate', { method: 'POST' })
    const body = await res.json()
    setLoading(false)
    if (!res.ok) { setError(body.error ?? 'Kunde inte skapa veckans recap.'); return }
    setRecord(body.digest)
  }

  if (!record) {
    return (
      <div className="bg-card border border-edge rounded-2xl p-5">
        <h2 className="font-medium text-fg mb-1">Veckans Recap</h2>
        <p className="text-muted text-xs mb-3">En helhetsbild av förra veckans pass, steg, sömn och följsamhet mot planen.</p>
        <button
          onClick={generate}
          disabled={loading}
          className="text-sm bg-accent text-bg px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? 'Skapar…' : 'Generera veckans recap'}
        </button>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    )
  }

  const { thisWeek, prevWeek, adherence, lookAhead, bestSession, newRecords } = record.data

  return (
    <div className="bg-card border border-edge rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-fg">Veckans Recap</h2>
          <p className="text-muted text-xs">{fmtDateRange(record.weekStartISO, record.weekEndISO)}</p>
        </div>
        <button onClick={generate} disabled={loading} className="text-xs text-muted hover:text-fg disabled:opacity-50">
          {loading ? 'Uppdaterar…' : 'Uppdatera'}
        </button>
      </div>

      {record.insights ? (
        <div className="space-y-2.5">
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Om veckans pass</div>
            <p className="text-sm text-fg leading-relaxed">{record.insights.sessions}</p>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Sömn & steg</div>
            <p className="text-sm text-fg leading-relaxed">{record.insights.wellness}</p>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Inför nästa vecka</div>
            <p className="text-sm text-fg leading-relaxed">{record.insights.motivation}</p>
          </div>
        </div>
      ) : (
        <p className="text-muted text-xs italic">Kunde inte skriva insikter just nu — siffrorna nedan stämmer ändå.</p>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {record.kost && (
        <div className="bg-bg rounded-xl p-3 space-y-2">
          <div className="text-xs text-muted uppercase tracking-wider">🍽️ Kost denna vecka{record.kost.source === 'yazio' ? ' (YAZIO)' : ''}</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-sm font-mono text-fg">{record.kost.avgKcal != null ? Math.round(record.kost.avgKcal) : '–'}</div>
              <div className="text-muted text-[11px]">kcal/dag{record.kost.kcalGoal != null ? ` / ${Math.round(record.kost.kcalGoal)}` : ''}</div>
            </div>
            <div>
              <div className="text-sm font-mono text-fg">{record.kost.daysWithData}/7</div>
              <div className="text-muted text-[11px]">dagar loggade</div>
            </div>
            <div>
              <div className="text-sm font-mono text-fg">{record.kost.avgProteinG != null ? `${Math.round(record.kost.avgProteinG)}g` : '–'}</div>
              <div className="text-muted text-[11px]">protein/dag</div>
            </div>
          </div>
          {record.kost.weightStartKg != null && record.kost.weightEndKg != null && (
            <div className="text-sm text-fg">Vikt: {record.kost.weightStartKg.toFixed(1)} kg → {record.kost.weightEndKg.toFixed(1)} kg</div>
          )}
          {record.kost.mostSkippedMeal && (
            <div className="text-sm text-fg">Loggas sällan: {record.kost.mostSkippedMeal.toLowerCase()}</div>
          )}
          {record.deficit && (
            <div className="text-sm text-fg">Viktmål: snitt {record.deficit.avgDiffKcal > 0 ? '+' : ''}{record.deficit.avgDiffKcal} kcal/dag mot budgeten ({record.deficit.budgetKcal} kcal)</div>
          )}
          {record.insights?.nutrition && (
            <p className="text-sm text-fg leading-relaxed pt-1 border-t border-edge">{record.insights.nutrition}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg rounded-xl p-3">
          <div className="text-2xl font-bold text-accent font-mono">{thisWeek.sessions.count}</div>
          <div className="text-muted text-xs">pass denna vecka</div>
          <Delta current={thisWeek.sessions.count} prev={prevWeek.sessions.count} />
        </div>
        <div className="bg-bg rounded-xl p-3">
          <div className="text-2xl font-bold text-accent font-mono">{thisWeek.sessions.totalKm}</div>
          <div className="text-muted text-xs">km denna vecka</div>
          <Delta current={thisWeek.sessions.totalKm} prev={prevWeek.sessions.totalKm} unit=" km" />
        </div>
      </div>

      {adherence && (
        <div className="bg-bg rounded-xl p-3">
          <div className="text-sm text-fg">{adherence.label}</div>
        </div>
      )}

      {bestSession && (
        <div className="bg-bg rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Veckans bästa pass</div>
            <div className="text-sm text-fg">{bestSession.label} · {bestSession.distanceKm > 0 ? `${bestSession.distanceKm} km · ` : ''}{bestSession.minutes} min</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-accent text-lg font-bold">{bestSession.load}</div>
            <div className="text-muted text-[10px]">belastning</div>
          </div>
        </div>
      )}

      {newRecords.length > 0 && (
        <div className="bg-bg rounded-xl p-3">
          <div className="text-xs text-muted uppercase tracking-wider mb-1.5">🏅 Nya rekord denna vecka</div>
          <div className="flex flex-col gap-1">
            {newRecords.map(r => (
              <div key={r.activityId} className="text-sm text-fg">
                {r.label}: <span className="text-accent">{r.records.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-sm font-mono text-fg">{thisWeek.wellness.avgSteps ? Math.round(thisWeek.wellness.avgSteps).toLocaleString('sv-SE') : '–'}</div>
          <div className="text-muted text-[11px]">steg/dag</div>
        </div>
        <div>
          <div className="text-sm font-mono text-fg">{thisWeek.wellness.avgSleepHours ? `${thisWeek.wellness.avgSleepHours.toFixed(1)}h` : '–'}</div>
          <div className="text-muted text-[11px]">sömn/natt</div>
        </div>
        <div>
          <div className="text-sm font-mono text-fg">{thisWeek.wellness.avgRestingHR ? Math.round(thisWeek.wellness.avgRestingHR) : '–'}</div>
          <div className="text-muted text-[11px]">vilopuls</div>
        </div>
      </div>

      {lookAhead.kind === 'plan' && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-1.5">Vecka framåt</div>
          <div className="flex flex-wrap gap-1.5">
            {lookAhead.sessions.filter(s => !s.isRest).map((s, i) => (
              <span key={i} className="text-xs bg-bg rounded-lg px-2 py-1 text-fg">{s.label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
