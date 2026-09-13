'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TrainingKcalTrendPoint } from '@/lib/training-load-trend'

type Props = { points: TrainingKcalTrendPoint[] }

const ACCENT = '#ccd400'
const MUTED  = '#6b7280'
const EDGE   = '#1e2428'

const tooltip = {
  contentStyle: { backgroundColor: '#161b1f', border: `1px solid ${EDGE}`, borderRadius: 12, color: '#e2e8ec', fontSize: 12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}

function shortDate(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

// Daniel: "kunde jag se TDEE grundande från träning... är ju intressant
// om den skulle droppa, motverkar ju att jag äter lite." Isolerad
// träningsdel av TDEE (träningssnitt × Garmin-korrigering), en punkt per
// vecka — separat från BMR/vikt-delen, så en nedgång här läses som "jag
// har tränat mindre", inte förväxlat med "jag har gått ner i vikt".
// connectNulls=false med flit — en vecka utan tillräcklig riktig data ska
// synas som ett hål i linjen, aldrig tystas ihop med en gissad siffra.
export default function TrainingLoadTrendChart({ points }: Props) {
  const hasAnyData = points.some(p => p.correctedTrainingKcalPerDay != null)
  if (!hasAnyData) return null

  const data = points.map(p => ({ date: shortDate(p.weekEndDateKey), Kcal: p.correctedTrainingKcalPerDay }))
  const latest = [...points].reverse().find(p => p.correctedTrainingKcalPerDay != null) ?? null
  const earliestWithData = points.find(p => p.correctedTrainingKcalPerDay != null) ?? null
  const trendDeltaKcal = latest && earliestWithData && latest !== earliestWithData
    ? latest.correctedTrainingKcalPerDay! - earliestWithData.correctedTrainingKcalPerDay!
    : null

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      <div className="flex items-start justify-between mb-1">
        <div className="text-xs text-muted uppercase tracking-wider">Träningens bidrag till TDEE</div>
        {latest?.correctedTrainingKcalPerDay != null && (
          <span className="font-mono text-accent text-sm font-bold">{latest.correctedTrainingKcalPerDay} kcal/dag</span>
        )}
      </div>
      <p className="text-muted text-[11px] mb-3">
        28-dagars rullande snitt, Garmin-korrigerat — samma siffra som styr din Viktmål-budget. Ett hål i linjen betyder för lite riktig träningsdata den perioden, inte noll.
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} stroke={EDGE} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
          <Tooltip {...tooltip} formatter={(v) => [`${v} kcal/dag`, 'Träning → TDEE']} />
          <Line type="monotone" dataKey="Kcal" stroke={ACCENT} strokeWidth={2} dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      {trendDeltaKcal != null && (
        <div className={`text-[11px] mt-2 ${trendDeltaKcal < 0 ? 'text-amber-400' : 'text-muted'}`}>
          {trendDeltaKcal > 0 ? '+' : ''}{trendDeltaKcal} kcal/dag sedan {shortDate(earliestWithData!.weekEndDateKey)}
          {trendDeltaKcal < 0 && ' — du har tränat mindre den här perioden'}
        </div>
      )}
    </div>
  )
}
