'use client'

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

type Activity = {
  start_date: string
  distance: number
  moving_time: number
  average_heartrate?: number | null
  sport_type: string
}

type Props = { activities: Activity[] }

function fmtPace(s: number, m: number) {
  if (!m || !s) return '--'
  const p = (s / m) * 500
  return `${Math.floor(p / 60)}:${Math.round(p % 60).toString().padStart(2, '0')}`
}

function paceSeconds(s: number, m: number) {
  if (!m || !s) return null
  return Math.round((s / m) * 500)
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

export default function TrainingCharts({ activities }: Props) {
  const rowing = activities.filter(a => a.sport_type === 'Rowing' && a.distance > 0 && a.moving_time > 0)
  const recent = rowing.slice(0, 40).reverse()

  // ── Per-session data ──────────────────────────────────────────────────────
  const sessionData = recent.map(a => ({
    date: new Date(a.start_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
    dist: Math.round(a.distance),
    distKm: +(a.distance / 1000).toFixed(2),
    dur: Math.round(a.moving_time / 60),
    pace: paceSeconds(a.moving_time, a.distance),
    paceStr: fmtPace(a.moving_time, a.distance),
    hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
  }))

  // ── Weekly volume (last 16 weeks) ─────────────────────────────────────────
  const weeklyMap: Record<string, { dist: number; count: number; label: string }> = {}
  rowing.forEach(a => {
    const d = new Date(a.start_date)
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const key = mon.toISOString().slice(0, 10)
    const label = mon.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    if (!weeklyMap[key]) weeklyMap[key] = { dist: 0, count: 0, label }
    weeklyMap[key].dist += a.distance
    weeklyMap[key].count += 1
  })
  const weeklyData = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-16)
    .map(([, v]) => ({ ...v, distKm: +(v.dist / 1000).toFixed(1) }))

  const avgPace = sessionData.filter(d => d.pace).reduce((s, d) => s + (d.pace ?? 0), 0) / (sessionData.filter(d => d.pace).length || 1)

  if (rowing.length === 0) {
    return (
      <div className="bg-card border border-edge rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-muted text-sm">Inga roddpass att visa ännu</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Weekly volume */}
      <div className="bg-card border border-edge rounded-2xl p-4">
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

      {/* Pace trend */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-4">Medelpace /500m — senaste 40</div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={sessionData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={EDGE} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false}
              domain={['auto', 'auto']}
              tickFormatter={v => {
                const m = Math.floor(v / 60); const s = Math.round(v % 60)
                return `${m}:${s.toString().padStart(2, '0')}`
              }}
              reversed
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(_: unknown, __: unknown, props: { payload?: { paceStr?: string } }) => [props.payload?.paceStr ?? '--', 'Pace /500m']}
            />
            <ReferenceLine y={avgPace} stroke={MUTED} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="pace" stroke={LCD} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <div className="text-xs text-muted mt-2">
          Snitt: <span className="font-mono text-lcd">{fmtPace(avgPace, 500)}/500m</span>
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
