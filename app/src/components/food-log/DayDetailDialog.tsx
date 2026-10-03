import Modal from '@/components/Modal'
import { computeDayCompleteness, kcalTotalForDay, kostMealLabel, type KostMeal } from '@/lib/kost'
import { resolveDayNutrition } from '@/lib/day-nutrition-source'
import { detectDayAnomalies, dayFlagLabel } from '@/lib/day-anomaly'
import type { YazioDay } from '@/lib/yazio-history'
import { DAY_TAGS, fmtDateLabel, macroSuffix, type DayContextTag, type FoodEntry, type KostSettings } from './shared'

type Props = {
  day: string
  entriesByDate: Map<string, FoodEntry[]>
  kostSettings: KostSettings
  dayOverrides: Set<string>
  yazioByDate: Map<string, YazioDay>
  todayKey: string
  deficitSummary: { avgDiffKcal: number; budgetKcal: number } | null
  dayNotes: Map<string, { tag: DayContextTag | null; note: string }>
  onClose: () => void
  /** Closes this dialog and opens the log flow for `dateKey`. */
  onLogForDay: (dateKey: string, meal: KostMeal | null) => void
  /** Closes this dialog and opens the edit dialog for `entry`. */
  onEditEntry: (entry: FoodEntry) => void
  onMarkComplete: (dateKey: string) => void
  onSaveNote: (dateKey: string, tag: DayContextTag | null, note: string) => void
}

export default function DayDetailDialog({
  day, entriesByDate, kostSettings, dayOverrides, yazioByDate, todayKey, deficitSummary, dayNotes,
  onClose, onLogForDay, onEditEntry, onMarkComplete, onSaveNote,
}: Props) {
  return (
    <Modal label="Dagens måltider" placement="bottom" panelClassName="max-h-[80vh]" onClose={onClose}>
    <div className="w-9 h-1 bg-edge rounded-full mx-auto mb-4" />
    {(() => {
      const dayEntries = entriesByDate.get(day) ?? []
      const completeness = computeDayCompleteness(kostSettings.trackedMeals, dayEntries, dayOverrides.has(day))
      const kcal = kcalTotalForDay(dayEntries)
      return (
        <>
          <div className="text-base font-bold mb-1">{fmtDateLabel(day)}</div>
          {completeness.status === 'no_data' && (
            <>
              <p className="text-muted text-sm mb-3">Ingen loggning den här dagen</p>
              <div className="flex gap-2 items-start bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5 text-xs text-red-300 mb-4">
                ⚠️ <span>Räknas inte med i veckans/månadens snitt förrän du fyllt i något — eller bekräftar att du åt inget.</span>
              </div>
              <button onClick={() => onLogForDay(day, null)} className="w-full bg-accent text-bg font-semibold py-3 rounded-xl text-sm mb-2">Logga mat för den här dagen</button>
              <button onClick={() => onMarkComplete(day)} className="w-full text-muted text-xs border border-edge rounded-xl py-2.5">Stämmer, jag åt inget den dagen</button>
            </>
          )}
          {completeness.status === 'incomplete' && (
            <>
              <p className="text-muted text-sm mb-3">{kcal} kcal loggat</p>
              <div className="flex gap-2 items-start bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5 text-xs text-red-300 mb-4">
                ⚠️ <span>Saknar: {completeness.missingMeals.map(kostMealLabel).join(', ')}. Kan bero på att du glömde logga, eller att något är loggat utan måltid nedan.</span>
              </div>
              {dayEntries.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {dayEntries.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEditEntry(e)}
                      className="flex items-center justify-between text-sm bg-bg rounded-lg px-3 py-2 text-left hover:border-accent/30 border border-transparent transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-fg break-words">{e.name}</div>
                        <div className={`text-[10px] ${e.meal ? 'text-muted' : 'text-amber-400'}`}>{e.meal ? kostMealLabel(e.meal) : 'Otaggat — tryck för att tagga'}</div>
                      </div>
                      <span className="font-mono text-muted text-xs">{e.calories} kcal{macroSuffix(e) && ` · ${macroSuffix(e)}`}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => onLogForDay(day, completeness.missingMeals[0])} className="w-full bg-accent text-bg font-semibold py-3 rounded-xl text-sm mb-2">Logga en till för den här dagen</button>
              <button onClick={() => onMarkComplete(day)} className="w-full text-muted text-xs border border-edge rounded-xl py-2.5">Stämmer, räkna med dagen ändå</button>
            </>
          )}
          {completeness.status === 'complete' && (
            <>
              <p className="text-muted text-sm mb-2 font-mono">{kcal} kcal{kostSettings.calorieGoal != null && <span> / {kostSettings.calorieGoal} kcal</span>}</p>
              {(() => {
                const yazioDay = yazioByDate.get(day)
                const daySource: 'yazio' | 'manual' = yazioDay?.kcalEaten != null ? 'yazio' : 'manual'
                const dayProteinG = daySource === 'yazio' ? (yazioDay?.proteinG ?? null) : dayEntries.reduce((s, e) => s + (e.protein_g ?? 0), 0)
                let baselineSum = 0
                let baselineCount = 0
                for (let i = 1; i <= 30; i++) {
                  const d = new Date(`${todayKey}T00:00:00`)
                  d.setDate(d.getDate() - i)
                  const key = d.toISOString().slice(0, 10)
                  const n = resolveDayNutrition(key, yazioByDate, entriesByDate, kostSettings.trackedMeals, dayOverrides)
                  if (n.isComplete) { baselineSum += n.eatenKcal; baselineCount++ }
                }
                const flags = detectDayAnomalies({
                  day: { eatenKcal: kcal, proteinG: dayProteinG, entries: dayEntries, isComplete: true, source: daySource },
                  baselineAvgKcal: baselineCount > 0 ? baselineSum / baselineCount : null,
                  baselineDaysLogged: baselineCount,
                  proteinGoalG: kostSettings.proteinGoalG,
                  budgetKcal: deficitSummary?.budgetKcal ?? null,
                })
                return flags.length > 0 ? <p className="text-amber-400 text-xs mb-4">{dayFlagLabel(flags[0])}</p> : <div className="mb-4" />
              })()}
              <div className="flex flex-col gap-2 mb-3">
                {dayEntries.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onEditEntry(e)}
                    className="flex items-center justify-between text-sm bg-bg rounded-lg px-3 py-2 text-left hover:border-accent/30 border border-transparent transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-fg break-words">{e.name}</div>
                      <div className={`text-[10px] ${e.meal ? 'text-muted' : 'text-amber-400'}`}>{e.meal ? kostMealLabel(e.meal) : 'Otaggat — tryck för att tagga'}</div>
                    </div>
                    <span className="font-mono text-muted text-xs">{e.calories} kcal{macroSuffix(e) && ` · ${macroSuffix(e)}`}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => onLogForDay(day, null)} className="w-full text-muted text-xs border border-edge rounded-xl py-2.5">Lägg till fler poster för den här dagen</button>
            </>
          )}
        </>
      )
    })()}

    <div className="pt-3 mt-1 border-t border-edge">
      <p className="text-muted text-[10px] uppercase tracking-wider mb-2">Kontext för dagen (valfritt)</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {DAY_TAGS.map(t => {
          const active = dayNotes.get(day)?.tag === t.value
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onSaveNote(day, active ? null : t.value, dayNotes.get(day)?.note ?? '')}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <input
        key={`${day}-note`}
        type="text"
        defaultValue={dayNotes.get(day)?.note ?? ''}
        onBlur={e => onSaveNote(day, dayNotes.get(day)?.tag ?? null, e.target.value)}
        placeholder="Kort anteckning, t.ex. vad som hände (valfritt)"
        className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-xs text-fg placeholder-muted focus:outline-none focus:border-accent"
      />
    </div>

    <button onClick={onClose} className="text-muted text-xs mt-4 w-full text-center">Stäng</button>
    </Modal>
  )
}
