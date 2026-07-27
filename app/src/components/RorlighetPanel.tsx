'use client'

import { useState, useMemo } from 'react'
import {
  Region, REGION_ORDER, REGION_LABELS, Exercise,
  exercisesForRegions, totalEstimatedSeconds,
} from '@/lib/mobility'

function fmtMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

export default function RorlighetPanel() {
  const [selected, setSelected] = useState<Set<Region>>(new Set())
  const [generated, setGenerated] = useState<Exercise[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const allSelected = selected.size === REGION_ORDER.length

  function toggleRegion(region: Region) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }

  function toggleWholeBody() {
    setSelected(allSelected ? new Set() : new Set(REGION_ORDER))
  }

  function generate() {
    const list = exercisesForRegions(Array.from(selected))
    setGenerated(list)
    setChecked(new Set())
    setExpanded(new Set())
    setStartedAt(Date.now())
    setSaved(false)
  }

  function toggleChecked(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const estimatedTotal = useMemo(() => generated ? totalEstimatedSeconds(generated) : 0, [generated])
  const allChecked = !!generated && generated.length > 0 && checked.size === generated.length

  async function logPass() {
    if (!generated) return
    setSaving(true)
    setError('')
    const movingTime = startedAt ? (Date.now() - startedAt) / 1000 : estimatedTotal
    try {
      const res = await fetch('/api/mobility/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercises: generated
            .filter(e => checked.has(e.id))
            .map(e => ({ id: e.id, name: e.name, region: e.region, dose: e.dose })),
          movingTime,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaved(true)
      } else {
        setError(data.error ?? 'Något gick fel')
      }
    } catch {
      setError('Nätverksfel')
    }
    setSaving(false)
  }

  return (
    <div>
      <p className="text-muted text-sm mb-4">Välj vad du vill stretcha, så sätter vi ihop ett pass åt dig — förankrat i forskning, inte AI-gissat</p>

      {!generated && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Vilka delar?</div>
            <button
              onClick={toggleWholeBody}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${
                allSelected ? 'bg-accent/10 text-accent border-accent/30' : 'text-muted border-edge hover:text-fg'
              }`}
            >
              {allSelected ? '✓ Hela kroppen' : 'Hela kroppen'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {REGION_ORDER.map(region => (
              <label
                key={region}
                className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(region) ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(region)}
                  onChange={() => toggleRegion(region)}
                  className="accent-[color:var(--accent)]"
                />
                {REGION_LABELS[region]}
              </label>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={selected.size === 0}
            className="mt-4 bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity w-full"
          >
            Generera pass
          </button>
        </div>
      )}

      {generated && (
        <>
          <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur pb-3 pt-1 -mx-4 px-4 md:mx-0 md:px-0">
            <div className="bg-card border border-edge rounded-xl p-3 flex items-center justify-between">
              <div className="text-sm">
                <span className="font-mono text-accent">{checked.size}/{generated.length}</span> övningar · ~{fmtMinutes(estimatedTotal)}
              </div>
              <button onClick={() => setGenerated(null)} className="text-muted text-xs hover:text-fg">Börja om</button>
            </div>
            <div className="h-1.5 bg-edge rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${generated.length ? (checked.size / generated.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-3">
            {generated.map(ex => {
              const isChecked = checked.has(ex.id)
              const isExpanded = expanded.has(ex.id)
              return (
                <div
                  key={ex.id}
                  className={`border rounded-xl transition-colors ${isChecked ? 'bg-accent/5 border-accent/30' : 'bg-card border-edge'}`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleChecked(ex.id)}
                      className="accent-[color:var(--accent)] w-4 h-4 flex-shrink-0"
                    />
                    <button onClick={() => toggleExpanded(ex.id)} className="flex-1 text-left min-w-0">
                      <div className={`text-sm font-medium ${isChecked ? 'text-muted line-through' : 'text-fg'}`}>{ex.name}</div>
                      <div className="text-muted text-xs mt-0.5">{REGION_LABELS[ex.region]} · {ex.dose}</div>
                    </button>
                    <button onClick={() => toggleExpanded(ex.id)} className="text-muted text-xs px-2 flex-shrink-0">
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 text-sm">
                      <ol className="list-decimal pl-5 flex flex-col gap-1 mb-3 text-fg">
                        {ex.instructions.map((step, i) => <li key={i}>{step}</li>)}
                      </ol>
                      <div className="text-muted text-xs leading-relaxed mb-2">
                        <span className="text-accent">Varför: </span>{ex.why}
                      </div>
                      {ex.caution && (
                        <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2 text-amber-300 text-xs leading-relaxed">
                          ⚠ {ex.caution}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-6 bg-card border border-edge rounded-2xl p-4">
            {saved ? (
              <div className="text-accent text-sm text-center">✓ Pass loggat i din passlogg</div>
            ) : (
              <>
                <button
                  onClick={logPass}
                  disabled={saving || checked.size === 0}
                  className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity w-full"
                >
                  {saving ? 'Sparar...' : allChecked ? 'Logga avklarat pass' : `Logga pass (${checked.size} avklarade)`}
                </button>
                {error && <div className="text-red-400 text-xs mt-2 text-center">{error}</div>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
