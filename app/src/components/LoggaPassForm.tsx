'use client'

import { useState, useMemo } from 'react'
import { SPORT_ICONS, sportLabel, usesDistance } from '@/lib/sport'
import { estimateCalories, DEFAULT_WEIGHT_KG } from '@/lib/calories'

const SPORT_ORDER = [
  'Run', 'TrailRun', 'Walk', 'Hike', 'Ride', 'VirtualRide', 'Swim', 'Rowing',
  'NordicSki', 'AlpineSki', 'WeightTraining', 'Kettlebell', 'HIIT', 'Elliptical', 'Yoga', 'Mobility', 'Workout',
]

// The 5-6 most common kettlebell movements — good enough to cover a normal
// session without turning this into a full exercise database.
const KETTLEBELL_EXERCISES = ['Svingar', 'Goblet Squat', 'Clean and Press', 'Turkish Get-up', 'Snatch', 'Marklyft']

function nowForInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function LoggaPassForm({ weightKg }: { weightKg?: number | null }) {
  const [sport, setSport] = useState<string | null>(null)
  const [minutes, setMinutes] = useState('')
  const [km, setKm] = useState('')
  const [startDate, setStartDate] = useState(nowForInput())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [exercises, setExercises] = useState<Record<string, { sets: string; reps: string }>>({})

  const movingTime = (parseFloat(minutes) || 0) * 60
  const distance = (parseFloat(km) || 0) * 1000
  const weight = weightKg ?? DEFAULT_WEIGHT_KG

  function toggleExercise(name: string) {
    setExercises(prev => {
      const next = { ...prev }
      if (next[name]) delete next[name]
      else next[name] = { sets: '3', reps: '10' }
      return next
    })
  }

  const exerciseSummary = useMemo(() => {
    return Object.entries(exercises)
      .filter(([, v]) => v.sets && v.reps)
      .map(([name, v]) => `${v.sets}x${v.reps} ${name}`)
      .join(', ')
  }, [exercises])

  const estimatedCalories = useMemo(() => {
    if (!sport || movingTime <= 0) return 0
    return estimateCalories(sport, movingTime, weight)
  }, [sport, movingTime, weight])

  async function save() {
    if (!sport || movingTime <= 0) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/activities/log-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sportType: sport,
          movingTime,
          distance,
          startDate: new Date(startDate).toISOString(),
          name: sport === 'Kettlebell' && exerciseSummary ? exerciseSummary : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaved(true)
        setSport(null)
        setMinutes('')
        setKm('')
        setStartDate(nowForInput())
        setExercises({})
      } else {
        setError(data.error ?? 'Något gick fel')
      }
    } catch {
      setError('Nätverksfel')
    }
    setSaving(false)
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Logga pass</h1>
        <p className="text-muted text-sm mt-1">Ange ett pass i efterhand — kalorier räknas ut automatiskt utifrån träningstyp, tid och din vikt</p>
      </div>

      {saved && (
        <div className="mb-4 bg-card border border-accent/30 rounded-2xl p-4 text-accent text-sm text-center">
          ✓ Pass loggat i din passlogg
        </div>
      )}

      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <div className="text-sm font-medium mb-3">Träningstyp</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {SPORT_ORDER.map(s => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-xs font-medium transition-colors ${
                  sport === s ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'
                }`}
              >
                <span className="text-lg leading-none">{SPORT_ICONS[s]}</span>
                <span className="capitalize text-center leading-tight">{sportLabel(s)}</span>
              </button>
            ))}
          </div>
        </div>

        {sport === 'Kettlebell' && (
          <div>
            <div className="text-sm font-medium mb-3">Övningar (valfritt)</div>
            <div className="flex flex-col gap-2">
              {KETTLEBELL_EXERCISES.map(name => {
                const picked = exercises[name]
                return (
                  <div key={name} className={`border rounded-xl px-3 py-2.5 transition-colors ${picked ? 'border-accent/30 bg-accent/5' : 'border-edge'}`}>
                    <button
                      onClick={() => toggleExercise(name)}
                      className="w-full flex items-center justify-between text-sm"
                    >
                      <span className={picked ? 'text-accent font-medium' : 'text-fg'}>{name}</span>
                      <span className={`text-xs ${picked ? 'text-accent' : 'text-muted'}`}>{picked ? '✓' : '+ Lägg till'}</span>
                    </button>
                    {picked && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={picked.sets}
                          onChange={e => setExercises(prev => ({ ...prev, [name]: { ...prev[name], sets: e.target.value } }))}
                          className="w-16 bg-bg border border-edge rounded-lg px-2 py-1.5 text-sm text-fg text-center focus:outline-none focus:border-accent"
                        />
                        <span className="text-muted text-xs">set ×</span>
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={picked.reps}
                          onChange={e => setExercises(prev => ({ ...prev, [name]: { ...prev[name], reps: e.target.value } }))}
                          className="w-16 bg-bg border border-edge rounded-lg px-2 py-1.5 text-sm text-fg text-center focus:outline-none focus:border-accent"
                        />
                        <span className="text-muted text-xs">reps</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {exerciseSummary && <p className="text-muted text-xs mt-2">{exerciseSummary}</p>}
          </div>
        )}

        {sport && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted text-xs block mb-1.5">Tid (minuter)</label>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={minutes}
                  onChange={e => setMinutes(e.target.value)}
                  placeholder="45"
                  className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              {usesDistance(sport) && (
                <div>
                  <label className="text-muted text-xs block mb-1.5">Sträcka (km)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    inputMode="decimal"
                    value={km}
                    onChange={e => setKm(e.target.value)}
                    placeholder="5"
                    className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-muted text-xs block mb-1.5">Datum &amp; tid</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {movingTime > 0 && (
              <div className="bg-bg border border-edge rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-muted text-xs">Uppskattade kalorier</span>
                <span className="font-mono text-accent text-lg">~{estimatedCalories} kcal</span>
              </div>
            )}
            {!weightKg && (
              <p className="text-muted text-xs -mt-2">
                Baserat på ett schablonvärde ({DEFAULT_WEIGHT_KG} kg) — <a href="/dashboard/profil" className="text-accent hover:underline">ange din vikt i Profil</a> för en mer exakt uppskattning.
              </p>
            )}

            <button
              onClick={save}
              disabled={saving || movingTime <= 0}
              className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity w-full"
            >
              {saving ? 'Sparar...' : 'Logga pass'}
            </button>
            {error && <div className="text-red-400 text-xs text-center">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
