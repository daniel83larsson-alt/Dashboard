'use client'

import { useState } from 'react'
import { startOfWeek } from '@/lib/dates'

const MOBILITY_WEEKLY_GOAL = 2

type Props = {
  trainedDates: string[] // ISO date strings
  mobilityDates?: string[] // ISO date strings — subset of trainedDates, marked with a second color
  plannedDates?: string[] // ISO date strings — planned-but-not-yet-done sessions from the weekly plan
  habitDates?: string[] // ISO date strings — at least one vana checked off that day
}

export default function ActivityCalendar({ trainedDates, mobilityDates = [], plannedDates = [], habitDates = [] }: Props) {
  const today = new Date()
  const weekStart = startOfWeek(today)
  const mobilityThisWeek = mobilityDates.filter(d => new Date(d) >= weekStart).length
  const mobilityGoalMet = mobilityThisWeek >= MOBILITY_WEEKLY_GOAL
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const viewDate = new Date(viewYear, viewMonth, 1)
  const monthName = viewDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  // sv-SE week starts Monday: 0=Mon…6=Sun; JS getDay 0=Sun
  const startOffset = (firstWeekday + 6) % 7

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const trained = new Set(
    trainedDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )
  const mobility = new Set(
    mobilityDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )
  const planned = new Set(
    plannedDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )
  const habitDone = new Set(
    habitDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const dayLabels = ['M', 'T', 'O', 'T', 'F', 'L', 'S']

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-muted uppercase tracking-wider capitalize">{monthName}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            aria-label="Föregående månad"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-card transition-colors"
          >
            ‹
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
              className="text-[10px] text-accent px-1.5 hover:underline"
            >
              idag
            </button>
          )}
          <button
            onClick={nextMonth}
            aria-label="Nästa månad"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-card transition-colors"
          >
            ›
          </button>
        </div>
      </div>
      <div className="bg-card border border-edge rounded-2xl p-4">
        {/* Cells are fixed-size, so this stays compact instead of stretching
            into oversized squares when the card spans a wide desktop column. */}
        <div className="max-w-xs mx-auto">
          {/* Day labels */}
          <div className="grid grid-cols-7 mb-2">
            {dayLabels.map((d, i) => (
              <div key={i} className="text-center text-muted text-xs pb-1">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const cellDate = new Date(viewYear, viewMonth, day)
              const dateStr = cellDate.toLocaleDateString('sv-SE')
              const isToday = isCurrentMonth && day === today.getDate()
              const hasTrained = trained.has(dateStr)
              const hasMobility = mobility.has(dateStr)
              // Ghost marker for a planned-but-not-yet-done session — turns
              // into the solid "trained" fill above once the matching
              // activity is logged/matched, so this only ever shows for the
              // still-open gap between planned and done.
              const hasPlanned = !hasTrained && planned.has(dateStr)
              const hasHabit = habitDone.has(dateStr)
              const isFuture = cellDate > today

              return (
                <div key={i} className="flex items-center justify-center h-9">
                  <div
                    className={`
                      w-7 h-7 flex items-center justify-center rounded-lg text-xs font-mono relative
                      ${isToday ? 'ring-1 ring-accent' : ''}
                      ${hasTrained ? 'bg-accent/20 text-accent font-bold' : hasPlanned ? 'border border-dashed border-accent/50 text-muted' : isFuture ? 'text-muted/40' : 'text-muted'}
                    `}
                  >
                    {hasTrained && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                    {hasMobility && (
                      <span className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-lcd" />
                    )}
                    {hasHabit && (
                      <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-habit" />
                    )}
                    {day}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-edge flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-xs text-muted">Tränat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-lcd" />
            <span className="text-xs text-muted">Rörlighet</span>
          </div>
          {habitDates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-habit" />
              <span className="text-xs text-muted">Vana</span>
            </div>
          )}
          {plannedDates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full border border-dashed border-accent/50" />
              <span className="text-xs text-muted">Planerat</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-lg ring-1 ring-accent" />
            <span className="text-xs text-muted">Idag</span>
          </div>
          <div className={`ml-auto text-xs font-mono ${mobilityGoalMet ? 'text-lcd' : 'text-muted'}`}>
            {mobilityGoalMet ? '✓ ' : ''}Rörlighet {mobilityThisWeek}/{MOBILITY_WEEKLY_GOAL} denna vecka
          </div>
        </div>
      </div>
    </div>
  )
}
