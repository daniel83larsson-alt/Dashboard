'use client'

import { useEffect, useState } from 'react'
import { zonesToSummary, type HrZone } from '@/lib/zones'
import ZoneBar from '@/components/ZoneBar'

type C2Split = { distance: number; time: number; pace: number; stroke_rate?: number; heart_rate?: number }

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}
function fmtPace(s: number, m: number) {
  if (!m) return '--'
  const p = (s / m) * 500
  return `${Math.floor(p / 60)}:${Math.round(p % 60).toString().padStart(2, '0')}/500m`
}

export default function ActivityEnrichment({ activityId, isGarmin }: { activityId: string; isGarmin: boolean }) {
  const [zones, setZones] = useState<HrZone[] | null>(null)
  const [splits, setSplits] = useState<C2Split[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (isGarmin) {
          const res = await fetch(`/api/activities/${activityId}/garmin-zones`)
          const data = await res.json()
          if (!cancelled) setZones(data.zones ?? null)
        } else {
          const res = await fetch(`/api/activities/${activityId}/concept2-detail`)
          const data = await res.json()
          if (!cancelled) setSplits(data.detail?.split ?? null)
        }
      } catch {
        // silently give up — enrichment is a bonus, not core functionality
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [activityId, isGarmin])

  if (loading) {
    return <div className="bg-card border border-edge rounded-2xl p-4 h-24 animate-pulse" />
  }

  if (isGarmin) {
    if (!zones || zones.length === 0) return null
    const summary = zonesToSummary(zones)
    if (summary.length === 0) return null

    return (
      <div>
        <div className="text-xs text-muted uppercase tracking-wider mb-3">Pulszoner</div>
        <div className="bg-card border border-edge rounded-2xl p-4">
          <ZoneBar zones={summary} />
        </div>
      </div>
    )
  }

  if (!splits || splits.length === 0) return null

  return (
    <div>
      <div className="text-xs text-muted uppercase tracking-wider mb-3">Delsträckor</div>
      <div className="bg-card border border-edge rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs border-b border-edge">
              <th className="text-left font-medium px-4 py-2">#</th>
              <th className="text-left font-medium px-4 py-2">Distans</th>
              <th className="text-left font-medium px-4 py-2">Tid</th>
              <th className="text-left font-medium px-4 py-2">/500m</th>
              <th className="text-left font-medium px-4 py-2">SPM</th>
              <th className="text-left font-medium px-4 py-2">HR</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((s, i) => (
              <tr key={i} className="border-b border-edge last:border-0">
                <td className="px-4 py-2 text-muted">{i + 1}</td>
                <td className="px-4 py-2 font-mono">{s.distance}m</td>
                <td className="px-4 py-2 font-mono">{fmtDur(s.time / 10)}</td>
                <td className="px-4 py-2 font-mono text-lcd">{fmtPace(s.time / 10, s.distance)}</td>
                <td className="px-4 py-2 font-mono">{s.stroke_rate ?? '--'}</td>
                <td className="px-4 py-2 font-mono">{s.heart_rate ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
