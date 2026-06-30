'use client'

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

export type DayWellness = {
  date: string
  restingHR: number | null
  sleepHours: number | null
  deepSleepHours: number | null
  remSleepHours: number | null
  lightSleepHours: number | null
  steps: number | null
  bodyBattery: number | null
  hrv: number | null
  hrvStatus: string | null
}

type Props = { history: DayWellness[] }

const ACCENT = '#ccd400'
const LCD    = '#a7bda9'
const MUTED  = '#6b7280'
const EDGE   = '#1e2428'
const BG     = '#0e1113'

const tooltip = {
  contentStyle: { backgroundColor: '#161b1f', border: `1px solid ${EDGE}`, borderRadius: 12, color: '#e2e8ec', fontSize: 12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}

function shortDate(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export default function WellnessCharts({ history }: Props) {
  if (!history.length) return null

  // Oldest first for charts
  const data = [...history].reverse()

  const hasSleep    = data.some(d => d.sleepHours != null)
  const hasSteps    = data.some(d => d.steps != null)
  const hasHR       = data.some(d => d.restingHR != null)
  const hasHRV      = data.some(d => d.hrv != null)
  const hasBattery  = data.some(d => d.bodyBattery != null)

  const latest = history[0]

  const sleepData = data.map(d => ({
    date: shortDate(d.date),
    Djup: d.deepSleepHours ? +d.deepSleepHours.toFixed(1) : null,
    REM: d.remSleepHours ? +d.remSleepHours.toFixed(1) : null,
    Lätt: d.lightSleepHours ? +d.lightSleepHours.toFixed(1) : null,
  }))

  const hrData = data.map(d => ({ date: shortDate(d.date), HR: d.restingHR ?? null }))
  const stepsData = data.map(d => ({ date: shortDate(d.date), Steg: d.steps ?? null }))
  const hrvData = data.map(d => ({ date: shortDate(d.date), HRV: d.hrv ? +d.hrv.toFixed(0) : null }))
  const batteryData = data.map(d => ({ date: shortDate(d.date), Batteri: d.bodyBattery ?? null }))

  const avgHR = hasHR ? Math.round(data.filter(d => d.restingHR).reduce((s, d) => s + d.restingHR!, 0) / data.filter(d => d.restingHR).length) : null

  return (
    <div className="flex flex-col gap-6">

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {latest.restingHR && (
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className="font-mono text-lcd text-lg font-bold">{latest.restingHR}</div>
            <div className="text-muted text-[11px]">Vilopuls</div>
          </div>
        )}
        {latest.sleepHours != null && latest.sleepHours > 0 && (
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className="font-mono text-accent text-lg font-bold">{latest.sleepHours.toFixed(1)}h</div>
            <div className="text-muted text-[11px]">Sömn</div>
          </div>
        )}
        {latest.steps != null && (
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className="font-mono text-accent text-lg font-bold">{(latest.steps / 1000).toFixed(1)}k</div>
            <div className="text-muted text-[11px]">Steg</div>
          </div>
        )}
        {latest.hrv != null && (
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className="font-mono text-lcd text-lg font-bold">{Math.round(latest.hrv)}</div>
            <div className="text-muted text-[11px]">HRV</div>
          </div>
        )}
        {latest.bodyBattery != null && (
          <div className="bg-card border border-edge rounded-xl p-3">
            <div className={`font-mono text-lg font-bold ${latest.bodyBattery >= 0 ? 'text-accent' : 'text-red-400'}`}>
              {latest.bodyBattery >= 0 ? '+' : ''}{latest.bodyBattery}
            </div>
            <div className="text-muted text-[11px]">Body Battery</div>
          </div>
        )}
      </div>

      {/* Sleep stages stacked bar */}
      {hasSleep && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-4">Sömnfaser (timmar)</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={sleepData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={EDGE} />
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltip} formatter={(v, n) => [`${v}h`, n]} />
              <Bar dataKey="Djup" stackId="s" fill={ACCENT} radius={[0,0,0,0]} />
              <Bar dataKey="REM" stackId="s" fill={LCD} radius={[0,0,0,0]} />
              <Bar dataKey="Lätt" stackId="s" fill="#374151" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-[10px] text-muted justify-center">
            <span><span style={{ color: ACCENT }}>▪</span> Djup</span>
            <span><span style={{ color: LCD }}>▪</span> REM</span>
            <span><span className="text-fg/30">▪</span> Lätt</span>
          </div>
        </div>
      )}

      {/* Resting HR */}
      {hasHR && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-4">Vilopuls (bpm)</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={hrData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke={EDGE} />
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip {...tooltip} formatter={(v) => [`${v} bpm`, 'Vilopuls']} />
              {avgHR && <ReferenceLine y={avgHR} stroke={MUTED} strokeDasharray="3 3" />}
              <Line type="monotone" dataKey="HR" stroke={LCD} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Steps */}
      {hasSteps && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-4">Dagliga steg</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={stepsData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={EDGE} />
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${Math.round(v/1000)}k`} />
              <Tooltip {...tooltip} formatter={(v) => [typeof v === 'number' ? v.toLocaleString('sv-SE') : v, 'Steg']} />
              <ReferenceLine y={10000} stroke={ACCENT} strokeDasharray="3 3" strokeOpacity={0.5} />
              <Bar dataKey="Steg" fill={ACCENT} radius={[3,3,0,0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
          <div className="text-[10px] text-muted mt-1">Streckad linje = 10 000 steg</div>
        </div>
      )}

      {/* HRV */}
      {hasHRV && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-4">HRV natt (ms)</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={hrvData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke={EDGE} />
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip {...tooltip} formatter={(v) => [`${v} ms`, 'HRV']} />
              <Line type="monotone" dataKey="HRV" stroke={ACCENT} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Body Battery */}
      {hasBattery && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-1">Body Battery (nattlig laddning)</div>
          <div className="text-[10px] text-muted mb-3">Positivt = laddad under natten</div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={batteryData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={EDGE} />
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltip} formatter={(v) => [typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v}` : v, 'Battery']} />
              <ReferenceLine y={0} stroke={MUTED} />
              <Bar dataKey="Batteri" radius={[3,3,0,0]}
                fill={ACCENT}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
