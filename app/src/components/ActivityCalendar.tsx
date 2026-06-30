'use client'

type Props = {
  trainedDates: string[] // ISO date strings
}

export default function ActivityCalendar({ trainedDates }: Props) {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()

  const monthName = today.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  // sv-SE week starts Monday: 0=Mon…6=Sun; JS getDay 0=Sun
  const startOffset = (firstWeekday + 6) % 7

  const trained = new Set(
    trainedDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const dayLabels = ['M', 'T', 'O', 'T', 'F', 'L', 'S']

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-muted uppercase tracking-wider capitalize">{monthName}</h2>
      </div>
      <div className="bg-card border border-edge rounded-2xl p-4">
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
            const dateStr = new Date(year, month, day).toLocaleDateString('sv-SE')
            const isToday = day === today.getDate()
            const hasTrained = trained.has(dateStr)
            const isFuture = day > today.getDate()

            return (
              <div key={i} className="flex items-center justify-center aspect-square">
                <div
                  className={`
                    w-7 h-7 flex items-center justify-center rounded-lg text-xs font-mono relative
                    ${isToday ? 'ring-1 ring-accent' : ''}
                    ${hasTrained ? 'bg-accent/20 text-accent font-bold' : isFuture ? 'text-muted/40' : 'text-muted'}
                  `}
                >
                  {hasTrained && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
                  )}
                  {day}
                </div>
              </div>
            )
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-edge">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-xs text-muted">Tränat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-lg ring-1 ring-accent" />
            <span className="text-xs text-muted">Idag</span>
          </div>
        </div>
      </div>
    </div>
  )
}
