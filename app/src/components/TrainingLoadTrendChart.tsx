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

// Same seven tags as Kost/Viktmål's day-context notes — duplicated on
// purpose rather than shared, same UI-only-constant convention already
// used for EVENT_KIND_LABEL/DAY_TAGS elsewhere in this app.
const TAG_LABELS: Record<string, string> = {
  sick: 'sjuk', social: 'socialt', travel: 'resa', stress: 'stress', injury: 'skada', other: 'annat',
}

function describeTagCounts(counts: Record<string, number>): string | null {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([tag, n]) => `${TAG_LABELS[tag] ?? tag} ${n} ${n === 1 ? 'dag' : 'dagar'}`)
  return parts.length ? parts.join(', ') : null
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
  // Daniel: "också då bra att veta hur den ändrats" — only surfaced for
  // the latest week (not every point) since that's the one someone's
  // actually asking "why" about right now.
  const latestTagSummary = latest ? describeTagCounts(latest.contextTagCounts) : null

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      <div className="flex items-start justify-between mb-1">
        <div className="text-xs text-muted uppercase tracking-wider">Träningens bidrag till TDEE</div>
        {latest?.correctedTrainingKcalPerDay != null && (
          <span className="font-mono text-accent text-sm font-bold">{latest.correctedTrainingKcalPerDay} kcal/dag</span>
        )}
      </div>
      <p className="text-muted text-[11px] mb-3">
        7-dagars rullande snitt, Garmin-korrigerat — en snabbare, mer studsig bild än den 14-dagars siffran som styr din Viktmål-budget. Ett hål i linjen betyder för lite riktig träningsdata den veckan, inte noll.
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} stroke={EDGE} />
          <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
          <Tooltip {...tooltip} formatter={(v) => [`${v} kcal/dag`, 'Träning → TDEE']} />
          {/* dot (not false) matters here specifically — with two null
              weeks possibly sitting right before the latest real one (a
              real case: Daniel's own data has exactly this shape after a
              sick week), an isolated point with no neighbor to connect a
              line to would otherwise render as literally nothing, hiding
              the most recent, most relevant value. */}
          <Line type="monotone" dataKey="Kcal" stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      {trendDeltaKcal != null && (
        <div className={`text-[11px] mt-2 ${trendDeltaKcal < 0 ? 'text-amber-400' : 'text-muted'}`}>
          {trendDeltaKcal > 0 ? '+' : ''}{trendDeltaKcal} kcal/dag sedan {shortDate(earliestWithData!.weekEndDateKey)}
          {trendDeltaKcal < 0 && ' — du har tränat mindre den här perioden'}
        </div>
      )}
      {latestTagSummary && (
        <div className="text-[11px] text-muted mt-1">Denna vecka: {latestTagSummary}</div>
      )}
    </div>
  )
}
