import type { Dispatch, SetStateAction } from 'react'
import Modal from '@/components/Modal'
import { kostMealLabel, type KostMeal } from '@/lib/kost'
import { normalizeDecimalInput, type LogQuickPickOpts, type QuickPick, type QuickPickConfirm } from './shared'

type Props = {
  confirmState: QuickPickConfirm
  setConfirmState: Dispatch<SetStateAction<QuickPickConfirm | null>>
  trackedMeals: KostMeal[]
  /** Newest entry logged today — the one "Ersätt senaste post" replaces. */
  latestTodayEntryId: string | undefined
  logging: boolean
  onLog: (pick: QuickPick, opts: LogQuickPickOpts) => void
  onUpdateValues: (pick: QuickPick, kcal: number, proteinG: number | null) => void
  onClose: () => void
}

export default function QuickPickDialog({
  confirmState, setConfirmState, trackedMeals, latestTodayEntryId, logging, onLog, onUpdateValues, onClose,
}: Props) {
  const { pick, meal, grams, multiplier, eveningGuard, kcal, protein } = confirmState
  const isDatabase = pick.source === 'database' && !!pick.off_id
  const parsedGrams = parseFloat(normalizeDecimalInput(grams))
  const parsedMultiplier = parseFloat(normalizeDecimalInput(multiplier))
  const parsedKcal = parseFloat(normalizeDecimalInput(kcal))
  const proteinTrim = protein.trim()
  const parsedProtein: number | null = proteinTrim === '' ? null : parseFloat(normalizeDecimalInput(proteinTrim))
  const proteinValid = parsedProtein == null || (Number.isFinite(parsedProtein) && parsedProtein >= 0)
  const baseKcalValid = Number.isFinite(parsedKcal) && parsedKcal > 0
  const dirty = !isDatabase && (parsedKcal !== pick.calories || (parsedProtein ?? null) !== (pick.protein_g ?? null))
  const previewKcal = isDatabase
    ? (pick.kcal_per_100g && parsedGrams > 0 ? Math.round(pick.kcal_per_100g * parsedGrams / 100) : pick.calories)
    : (parsedMultiplier > 0 && baseKcalValid ? Math.round(parsedKcal * parsedMultiplier) : pick.calories)
  const canConfirm = isDatabase ? parsedGrams > 0 : parsedMultiplier > 0 && baseKcalValid && proteinValid
  const canUpdate = !isDatabase && dirty && baseKcalValid && proteinValid

  function confirm(replaceEntryId?: string) {
    onLog(pick, {
      meal,
      grams: isDatabase ? parsedGrams : undefined,
      multiplier: !isDatabase ? parsedMultiplier : undefined,
      baseKcal: !isDatabase ? Math.round(parsedKcal) : undefined,
      baseProteinG: !isDatabase ? parsedProtein : undefined,
      replaceEntryId,
    })
  }

  const updateButton = canUpdate || dirty ? (
    <button type="button" onClick={() => onUpdateValues(pick, Math.round(parsedKcal), parsedProtein)} disabled={!canUpdate || logging} className="w-full text-accent border border-accent/40 rounded-xl py-2.5 text-sm disabled:opacity-50">Uppdatera rätten</button>
  ) : null

  return (
    <Modal label={pick.name} z={70} onClose={onClose}>
      <p className="text-fg text-sm font-medium mb-3">{pick.name} <span className="text-muted font-normal">· {previewKcal} kcal</span></p>

      <label className="text-muted text-xs block mb-1.5">Måltid</label>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {trackedMeals.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setConfirmState(prev => prev ? { ...prev, meal: m } : prev)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${meal === m ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
          >
            {kostMealLabel(m)}
          </button>
        ))}
      </div>

      {isDatabase ? (
        <div className="mb-3">
          <label htmlFor="quickpickdialog-f1" className="text-muted text-xs block mb-1.5">Mängd (g)</label>
          <input id="quickpickdialog-f1"
            type="text" inputMode="decimal" value={grams}
            onChange={e => setConfirmState(prev => prev ? { ...prev, grams: normalizeDecimalInput(e.target.value) } : prev)}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2 text-sm text-fg focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label htmlFor="quickpickdialog-f2" className="text-muted text-xs block mb-1.5">Kcal per portion</label>
              <input id="quickpickdialog-f2"
                type="text" inputMode="decimal" value={kcal}
                onChange={e => setConfirmState(prev => prev ? { ...prev, kcal: normalizeDecimalInput(e.target.value) } : prev)}
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2 text-sm text-fg focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label htmlFor="quickpickdialog-f3" className="text-muted text-xs block mb-1.5">Protein (g)</label>
              <input id="quickpickdialog-f3"
                type="text" inputMode="decimal" value={protein} placeholder="saknas"
                onChange={e => setConfirmState(prev => prev ? { ...prev, protein: normalizeDecimalInput(e.target.value) } : prev)}
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2 text-sm text-fg focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="quickpickdialog-f4" className="text-muted text-xs block mb-1.5">Antal portioner</label>
            <input id="quickpickdialog-f4"
              type="text" inputMode="decimal" value={multiplier}
              onChange={e => setConfirmState(prev => prev ? { ...prev, multiplier: normalizeDecimalInput(e.target.value) } : prev)}
              className="w-full bg-bg border border-edge rounded-xl px-4 py-2 text-sm text-fg focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          {dirty && <p className="text-muted text-[11px] mb-3">Du har ändrat värdena. <b className="text-fg font-medium">Logga</b> använder dem bara för den här måltiden — <b className="text-fg font-medium">Uppdatera rätten</b> sparar dem på snabbvalet till nästa gång.</p>}
        </>
      )}

      {eveningGuard ? (
        <>
          <p className="text-muted text-xs mb-3">Du har redan loggat något idag och det är kväll — ersätt din senaste post eller lägg till en till?</p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => confirm(latestTodayEntryId)} disabled={!latestTodayEntryId || !canConfirm || logging} className="w-full bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">Ersätt senaste post</button>
            <button type="button" onClick={() => confirm()} disabled={!canConfirm || logging} className="w-full text-fg border border-edge rounded-xl py-2.5 text-sm disabled:opacity-50">Lägg till ändå</button>
            {updateButton}
            <button type="button" onClick={onClose} className="text-muted text-xs mt-1">Avbryt</button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => confirm()} disabled={!canConfirm || logging} className="w-full bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">{logging ? 'Loggar…' : 'Logga'}</button>
          {updateButton}
          <button type="button" onClick={onClose} className="text-muted text-xs mt-1">Avbryt</button>
        </div>
      )}
    </Modal>
  )
}
