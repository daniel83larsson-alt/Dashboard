'use client'

import { useEffect, useState } from 'react'
import { zonesToSummary, type HrZone } from '@/lib/zones'
import ZoneBar from '@/components/ZoneBar'

type C2Split = { type?: string; distance: number; time: number; stroke_rate?: number; heart_rate?: { average?: number } }

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

// Takes the Garmin and/or Concept2 activity id for the SAME real-world
// session. When a pass was synced from both (e.g. Concept2 for the erg,
// Garmin worn on the wrist for HR), both ids are passed and this renders
// Concept2's splits — the erg's own precise per-stroke measurement, which
// Garmin's wrist-based tracking doesn't match for indoor rowing — alongside
// Garmin's HR-zone breakdown, which Concept2 doesn't compute on its own.
export default function ActivityEnrichment({ garminActivityId, concept2ActivityId }: { garminActivityId?: string; concept2ActivityId?: string }) {
  const [zones, setZones] = useState<HrZone[] | null>(null)
  const [splits, setSplits] = useState<C2Split[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await Promise.all([
          garminActivityId
            ? fetch(`/api/activities/${garminActivityId}/garmin-zones`)
                .then(r => r.json())
                .then(data => { if (!cancelled) setZones(data.zones ?? null) })
            : Promise.resolve(),
          concept2ActivityId
            ? fetch(`/api/activities/${concept2ActivityId}/concept2-detail`)
                .then(r => r.json())
                .then(data => { if (!cancelled) setSplits(data.detail?.workout?.splits ?? null) })
            : Promise.resolve(),
        ])
      } catch {
        // silently give up — enrichment is a bonus, not core functionality
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [garminActivityId, concept2ActivityId])

  if (loading && (garminActivityId || concept2ActivityId)) {
    return <div className="bg-card border border-edge rounded-2xl p-4 h-24 animate-pulse" />
  }

  const zoneSummary = zones ? zonesToSummary(zones) : []
  const hasZones = zoneSummary.length > 0
  const hasSplits = !!splits && splits.length > 0

  if (!hasZones && !hasSplits) return null

  return (
    <div className="flex flex-col gap-5">
      {hasZones && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Pulszoner</div>
          <div className="bg-card border border-edge rounded-2xl p-4">
            <ZoneBar zones={zoneSummary} />
          </div>
        </div>
      )}

      {hasSplits && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Delsträckor</div>
          <div className="bg-card border border-edge rounded-2xl overflow-x-auto">
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
                {splits!.map((s, i) => (
                  <tr key={i} className="border-b border-edge last:border-0">
                    <td className="px-4 py-2 text-muted">{i + 1}</td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">{s.distance}m</td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">{fmtDur(s.time / 10)}</td>
                    <td className="px-4 py-2 font-mono text-lcd whitespace-nowrap">{fmtPace(s.time / 10, s.distance)}</td>
                    <td className="px-4 py-2 font-mono">{s.stroke_rate ?? '--'}</td>
                    <td className="px-4 py-2 font-mono">{s.heart_rate?.average ?? '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
