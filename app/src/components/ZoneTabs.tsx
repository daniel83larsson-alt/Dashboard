'use client'

import { useState } from 'react'
import ZoneBar from '@/components/ZoneBar'
import type { ZoneSummary } from '@/lib/zones'

type Period = { key: string; label: string; zones: ZoneSummary[]; analyzed: number; total: number }

export default function ZoneTabs({ periods }: { periods: Period[] }) {
  const [selected, setSelected] = useState(periods[0]?.key)
  const active = periods.find(p => p.key === selected) ?? periods[0]
  if (!active) return null

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {periods.map(p => (
          <button
            key={p.key}
            onClick={() => setSelected(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selected === p.key ? 'bg-accent text-bg' : 'bg-card border border-edge text-muted hover:text-fg'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="bg-card border border-edge rounded-2xl p-4">
        {active.zones.length > 0 ? (
          <>
            <div className="text-xs text-muted mb-3">{active.analyzed} av {active.total} pass analyserade</div>
            <ZoneBar zones={active.zones} />
          </>
        ) : (
          <div className="text-xs text-muted text-center py-4">Ingen zondata ännu för perioden</div>
        )}
      </div>
    </div>
  )
}
