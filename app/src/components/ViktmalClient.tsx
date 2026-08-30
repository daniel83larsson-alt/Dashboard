'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { dailyDiffStatus, compute7DayAverage } from '@/lib/deficit'

const ACCENT = '#ccd400'
const MUTED = '#6b7280'
const EDGE = '#1e2428'
const chartTooltip = {
  contentStyle: { backgroundColor: '#161b1f', border: `1px solid ${EDGE}`, borderRadius: 12, color: '#e2e8ec', fontSize: 12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}

export type DayEntry = { date: string; eatenKcal: number; isComplete: boolean; source: 'yazio' | 'manual' }
export type Measurement = { date: string; weightKg: number | null; waistCm: number | null; source: 'manual' | 'yazio' }

const STATUS_DOT: Record<string, string> = { grey: 'bg-muted', green: 'bg-accent', yellow: 'bg-amber-400', red: 'bg-red-400' }
const STATUS_LABEL: Record<string, string> = { grey: 'Ej färdigloggad', green: 'Inom budget', yellow: 'Lite över', red: 'Klart över' }

function fmtDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export default function ViktmalClient({
  todayKey,
  days,
  measurements: initialMeasurements,
  budgetKcal,
  tdeeKcal,
  budgetComputedAt,
  startWeightKg,
  startDate,
  targetWeightKg,
  targetDate,
  weighInWeekday,
  todayTrainingKcalRaw,
  garminCorrection,
}: {
  todayKey: string
  days: DayEntry[]
  measurements: Measurement[]
  budgetKcal: number | null
  tdeeKcal: number | null
  budgetComputedAt: string | null
  startWeightKg: number | null
  startDate: string | null
  targetWeightKg: number | null
  targetDate: string | null
  weighInWeekday: number
  todayTrainingKcalRaw: number
  garminCorrection: number
}) {
  const router = useRouter()
  const [measurements, setMeasurements] = useState(initialMeasurements)
  const [logDate, setLogDate] = useState(todayKey)
  const [logWeight, setLogWeight] = useState('')
  const [logWaist, setLogWaist] = useState('')
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState('')
  const [logOpen, setLogOpen] = useState(false)

  const today = days[days.length - 1]
  const budget = budgetKcal ?? 0
  const todayStatus = budgetKcal != null ? dailyDiffStatus(today.eatenKcal, budget, today.isComplete) : 'grey'
  const weekAvg = useMemo(
    () => compute7DayAverage(days.map(d => ({ eatenKcal: d.eatenKcal, isComplete: d.isComplete })), budget),
    [days, budget]
  )

  const weightHistory = useMemo(
    () => measurements.filter((m): m is Measurement & { weightKg: number } => m.weightKg != null).sort((a, b) => a.date.localeCompare(b.date)),
    [measurements]
  )
  const currentWeightKg = weightHistory.length ? weightHistory[weightHistory.length - 1].weightKg : startWeightKg
  const waistHistory = useMemo(
    () => measurements.filter((m): m is Measurement & { waistCm: number } => m.waistCm != null).sort((a, b) => a.date.localeCompare(b.date)),
    [measurements]
  )
  const latestWaist = waistHistory.length ? waistHistory[waistHistory.length - 1] : null

  const progressPct = startWeightKg != null && targetWeightKg != null && currentWeightKg != null && startWeightKg !== targetWeightKg
    ? Math.min(100, Math.max(0, Math.round(((startWeightKg - currentWeightKg) / (startWeightKg - targetWeightKg)) * 100)))
    : null

  const chartData = weightHistory.map(m => ({ date: fmtDate(m.date), Vikt: m.weightKg }))
  const modelBKcal = budgetKcal != null ? Math.round(budgetKcal + todayTrainingKcalRaw * garminCorrection) : null

  const weekdayLabels = ['Sön', 'Mån', 'Tis', 'Ons', 'Tors', 'Fre', 'Lör']

  async function logMeasurement() {
    setLogError('')
    const weightKg = logWeight.trim() ? parseFloat(logWeight) : undefined
    const waistCm = logWaist.trim() ? parseFloat(logWaist) : undefined
    if (weightKg == null && waistCm == null) { setLogError('Ange vikt eller midjemått'); return }
    setLogging(true)
    try {
      const res = await fetch('/api/body/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: logDate, weightKg, waistCm }),
      })
      const data = await res.json()
      if (res.ok) {
        setMeasurements(prev => [...prev.filter(m => !(m.date === logDate && m.source === 'manual')), { date: logDate, weightKg: data.entry.weight_kg, waistCm: data.entry.waist_cm, source: 'manual' }])
        setLogWeight('')
        setLogWaist('')
        setLogOpen(false)
        router.refresh()
      } else {
        setLogError(data.error ?? 'Kunde inte spara')
      }
    } catch {
      setLogError('Nätverksfel')
    }
    setLogging(false)
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Viktmål</h1>
        <p className="text-muted text-sm mt-1">
          {targetWeightKg != null ? `Mot ${targetWeightKg} kg${targetDate ? ` till ${new Date(`${targetDate}T00:00:00`).toLocaleDateString('sv-SE')}` : ''}` : 'Inget mål satt'}
        </p>
      </div>

      {/* Lager 1: idag */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[todayStatus]}`} />
            Idag
          </span>
          <span className="text-xs text-muted">{STATUS_LABEL[todayStatus]}</span>
        </div>
        {budgetKcal != null ? (
          <>
            <div className="flex items-baseline justify-between mt-2">
              <span className="font-mono text-fg text-lg font-bold">{today.eatenKcal}<span className="text-muted text-sm font-normal"> / {budgetKcal} kcal</span></span>
            </div>
            {modelBKcal != null && todayTrainingKcalRaw > 0 && (
              <p className="text-muted text-xs mt-1.5">Om du åt tillbaka dagens träning: {modelBKcal} kcal (visas bara som referens — styr inte budgeten)</p>
            )}
          </>
        ) : (
          <p className="text-muted text-xs mt-2">Ingen budget uträknad än — fyll i startvikt, målvikt och måldatum i Profil.</p>
        )}
        <p className="text-muted text-xs mt-2">Dagssiffran är en uppskattning och svänger mycket. Titta på snittet nedan.</p>
      </div>

      {/* Lager 2: 7-dagars snitt */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-2">7-dagars snitt</div>
        {weekAvg.avgDiffKcal != null ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-accent text-2xl font-bold">{weekAvg.avgDiffKcal > 0 ? '+' : ''}{weekAvg.avgDiffKcal} kcal/dag</span>
              {tdeeKcal != null && budgetKcal != null && <span className="text-muted text-xs">mål −{tdeeKcal - budgetKcal} kcal/dag</span>}
            </div>
            <p className="text-muted text-xs mt-1">{weekAvg.completeDays} av 7 dagar färdigloggade{weekAvg.incompleteDays > 0 ? ` · ${weekAvg.incompleteDays} räknas inte med` : ''}</p>
          </>
        ) : (
          <p className="text-muted text-xs">Logga några dagar till så kan vi räkna ({weekAvg.completeDays} av minst 4 färdigloggade dagar hittills).</p>
        )}
      </div>

      {/* Lager 3: faktisk progress */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-3">Viktresa{startDate ? ` · startade ${fmtDate(startDate)}` : ''}</div>
        {startWeightKg != null && targetWeightKg != null ? (
          <>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-mono text-fg">{startWeightKg.toFixed(1)} kg</span>
              {currentWeightKg != null && currentWeightKg !== startWeightKg && (
                <span className="font-mono text-accent font-bold">{currentWeightKg.toFixed(1)} kg</span>
              )}
              <span className="font-mono text-muted">{targetWeightKg.toFixed(1)} kg</span>
            </div>
            {progressPct != null && (
              <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden mb-1">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            )}
            {progressPct != null && <p className="text-muted text-xs">{progressPct}% mot målet</p>}
          </>
        ) : (
          <p className="text-muted text-xs">Sätt startvikt och målvikt i Profil för att se din resa här.</p>
        )}

        {latestWaist && (
          <p className="text-muted text-xs mt-3 pt-3 border-t border-edge">Midjemått senast: {latestWaist.waistCm} cm ({fmtDate(latestWaist.date)})</p>
        )}

        {chartData.length > 2 && (
          <div className="mt-4 pt-3 border-t border-edge">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} stroke={EDGE} />
                <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip {...chartTooltip} formatter={(v) => [`${v} kg`, 'Vikt']} />
                {targetWeightKg != null && <ReferenceLine y={targetWeightKg} stroke={MUTED} strokeDasharray="3 3" />}
                <Line type="monotone" dataKey="Vikt" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {tdeeKcal != null && budgetComputedAt && (
          <p className="text-muted text-[10px] mt-3">Budget uträknad {new Date(budgetComputedAt).toLocaleDateString('sv-SE')} (TDEE ~{tdeeKcal} kcal) — räknas om automatiskt om vikten rör sig mycket eller inställningarna ändras.</p>
        )}
      </div>

      {/* Väg in */}
      <button type="button" onClick={() => setLogOpen(v => !v)} className="bg-accent text-bg font-semibold py-3 rounded-2xl text-sm hover:opacity-90 transition-opacity">
        {logOpen ? 'Stäng' : '+ Väg in'}
      </button>

      {logOpen && (
        <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-muted text-xs">Väg dig helst {weekdayLabels[weighInWeekday]} morgon, före frukost, för den mest tillförlitliga kurvan.</p>
          <div>
            <label className="text-muted text-xs block mb-1.5">Datum</label>
            <input type="date" value={logDate} max={todayKey} onChange={e => setLogDate(e.target.value)} className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-muted text-xs block mb-1.5">Vikt (kg)</label>
              <input type="number" step={0.1} inputMode="decimal" value={logWeight} onChange={e => setLogWeight(e.target.value)} placeholder="t.ex. 92.4" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Midjemått (cm, valfritt)</label>
              <input type="number" step={0.5} inputMode="decimal" value={logWaist} onChange={e => setLogWaist(e.target.value)} placeholder="t.ex. 98" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
            </div>
          </div>
          {logError && <p className="text-red-400 text-xs">{logError}</p>}
          <button type="button" onClick={logMeasurement} disabled={logging} className="bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {logging ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      )}
    </div>
  )
}
