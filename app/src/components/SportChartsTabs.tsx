'use client'

import { useState } from 'react'
import TrainingCharts from '@/components/TrainingCharts'
import { sportLabel, sportIcon } from '@/lib/sport'

type Activity = {
  start_date: string
  distance: number
  moving_time: number
  average_heartrate?: number | null
  sport_type: string
}

export default function SportChartsTabs({ activities }: { activities: Activity[] }) {
  const bySport = activities.reduce<Record<string, number>>((acc, a) => {
    acc[a.sport_type] = (acc[a.sport_type] ?? 0) + (a.distance ?? 0)
    return acc
  }, {})
  const sports = Object.entries(bySport).sort((a, b) => b[1] - a[1]).map(([s]) => s)

  const [selected, setSelected] = useState(sports[0] ?? 'Rowing')

  if (sports.length === 0) {
    return (
      <div className="bg-card border border-edge rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-muted text-sm">Inga pass att visa ännu</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {sports.length > 1 && (
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sports.map(s => (
              <button
                key={s}
                onClick={() => setSelected(s)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors capitalize ${
                  selected === s ? 'bg-accent text-bg' : 'bg-card border border-edge text-muted hover:text-fg'
                }`}
              >
                <span>{sportIcon(s)}</span>
                {sportLabel(s)}
              </button>
            ))}
          </div>
          {/* Fade hint that the chip row scrolls horizontally — most sports
              lists overflow their container on mobile with no other cue. */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-bg to-transparent" />
        </div>
      )}
      <TrainingCharts activities={activities} sport={selected} />
    </div>
  )
}
