'use client'

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { isCycling, isRunOrWalk, sportLabel, fmtSpeedOrPace, fmtMinSec } from '@/lib/sport'

type Activity = {
  start_date: string
  distance: number
  moving_time: number
  average_heartrate?: number | null
  sport_type: string
}

type Props = { activities: Activity[]; sport: string }

function paceSeconds(s: number, m: number) {
  if (!m || !s) return null
  return Math.round((s / m) * 500)
}

function paceSecondsPerKm(s: number, m: number) {
  if (!m || !s) return null
  return Math.round((s / m) * 1000)
}

function speedKmh(s: number, m: number) {
  if (!m || !s) return null
  return +((m / 1000) / (s / 3600)).toFixed(1)
}

const ACCENT = '#ccd400'
const LCD = '#a7bda9'
const MUTED = '#6b7280'
const EDGE = '#1e2428'

const tooltipStyle = {
  backgroundColor: '#161b1f',
  border: `1px solid ${EDGE}`,
  borderRadius: 12,
  color: '#e2e8ec',
  fontSize: 12,
}

export default function TrainingCharts({ activities, sport }: Props) {
  const filtered = activities.filter(a => a.sport_type === sport && a.distance > 0 && a.moving_time > 0)
  const recent = filtered.slice(0, 40).reverse()
  const cycling = isCycling(sport)
  const runWalk = isRunOrWalk(sport)
  const label = sportLabel(sport)

  // ── Per-session data ──────────────────────────────────────────────────────
  const sessionData = recent.map(a => {
    let pace: number | null
    if (cycling) pace = speedKmh(a.moving_time, a.distance)
    else if (runWalk) pace = paceSecondsPerKm(a.moving_time, a.distance)
    else pace = paceSeconds(a.moving_time, a.distance)
    const speedOrPace = fmtSpeedOrPace(a.sport_type, a.distance, a.moving_time)
    return {
      date: new Date(a.start_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
      dist: Math.round(a.distance),
      distKm: +(a.distance / 1000).toFixed(2),
      dur: Math.round(a.moving_time / 60),
      pace,
      paceStr: speedOrPace ? speedOrPace.value : '--',
      hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    }
  })

  // ── Weekly volume (last 16 weeks) ─────────────────────────────────────────
  const weeklyMap: Record<string, { dist: number; count: number; label: string }> = {}
  filtered.forEach(a => {
    const d = new Date(a.start_date)
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const key = mon.toISOString().slice(0, 10)
    const wkLabel = mon.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    if (!weeklyMap[key]) weeklyMap[key] = { dist: 0, count: 0, label: wkLabel }
    weeklyMap[key].dist += a.distance
    weeklyMap[key].count += 1
  })
  const weeklyData = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-16)
    .map(([, v]) => ({ ...v, distKm: +(v.dist / 1000).toFixed(1) }))

  const avgPaceOrSpeed = sessionData.filter(d => d.pace != null).reduce((s, d) => s + (d.pace ?? 0), 0) / (sessionData.filter(d => d.pace != null).length || 1)

  if (filtered.length === 0) {
    return (
      <div className="bg-card border border-edge rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-muted text-sm">Inga {label}-pass att visa ännu</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">

      {/* Weekly volume — full-width headline chart */}
      <div className="bg-card border border-edge rounded-2xl p-4 lg:col-span-2">
        <div className="text-xs text-muted uppercase tracking-wider mb-4">Veckovolym (km)</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeklyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={EDGE} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} km`, "Distans"]} />
            <Bar dataKey="distKm" fill={ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Distance per session */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-4">Distans per pass (m) — senaste 40</div>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={sessionData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={EDGE} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} m`, "Distans"]} />
            <Area type="monotone" dataKey="dist" stroke={ACCENT} strokeWidth={2} fill="url(#distGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pace/speed trend */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-4">
          {cycling ? 'Snitthastighet (km/h)' : runWalk ? 'Snittempo (min/km)' : 'Snittempo (/500m)'} — senaste 40
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={sessionData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={EDGE} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false}
              domain={['auto', 'auto']}
              tickFormatter={v => {
                if (cycling) return `${v}`
                const m = Math.floor(v / 60); const s = Math.round(v % 60)
                return `${m}:${s.toString().padStart(2, '0')}`
              }}
              reversed={!cycling}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(_: unknown, __: unknown, props: { payload?: { paceStr?: string } }) => [props.payload?.paceStr ?? '--', cycling ? 'Hastighet' : 'Tempo']}
            />
            <ReferenceLine y={avgPaceOrSpeed} stroke={MUTED} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="pace" stroke={LCD} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <div className="text-xs text-muted mt-2">
          Snitt: <span className="font-mono text-lcd">{
            cycling ? `${avgPaceOrSpeed.toFixed(1)} km/h`
            : `${fmtMinSec(avgPaceOrSpeed)}${runWalk ? '/km' : '/500m'}`
          }</span>
          <span className="ml-2 opacity-50">(streckad linje)</span>
        </div>
      </div>

      {/* HR trend */}
      {sessionData.some(d => d.hr) && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-4">Snitt-puls per pass</div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={sessionData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={LCD} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={LCD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={EDGE} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} bpm`, "Snitt-HR"]} />
              <Area type="monotone" dataKey="hr" stroke={LCD} strokeWidth={2} fill="url(#hrGrad)" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Session length distribution */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-4">Passlängd i minuter — senaste 40</div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={sessionData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={EDGE} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, "Passlängd"]} />
            <Bar dataKey="dur" fill={ACCENT} opacity={0.7} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
