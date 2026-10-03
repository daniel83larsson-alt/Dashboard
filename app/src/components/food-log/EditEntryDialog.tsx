import Modal from '@/components/Modal'
import { KOST_MEALS, kostMealLabel, type KostMeal } from '@/lib/kost'

type Props = {
  trackingEnabled: boolean
  name: string; onNameChange: (v: string) => void
  kcal: string; onKcalChange: (v: string) => void
  protein: string; onProteinChange: (v: string) => void
  carb: string; onCarbChange: (v: string) => void
  fat: string; onFatChange: (v: string) => void
  meal: KostMeal | null; onMealChange: (m: KostMeal) => void
  saving: boolean
  onSave: () => void
  onClose: () => void
}

export default function EditEntryDialog({
  trackingEnabled, name, onNameChange, kcal, onKcalChange, protein, onProteinChange, carb, onCarbChange, fat, onFatChange,
  meal, onMealChange, saving, onSave, onClose,
}: Props) {
  return (
    <Modal label="Redigera post" panelClassName="flex flex-col gap-3" onClose={onClose}>
    <div className="text-sm font-semibold">Redigera post</div>
    <div>
      <label htmlFor="editentrydialog-f1" className="text-muted text-xs block mb-1.5">Namn</label>
      <input id="editentrydialog-f1" type="text" value={name} onChange={e => onNameChange(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
    </div>
    {trackingEnabled && (
      <div>
        <label className="text-muted text-xs block mb-1.5">Måltid</label>
        <div className="flex flex-wrap gap-1.5">
          {KOST_MEALS.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onMealChange(m)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${meal === m ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
            >
              {kostMealLabel(m)}
            </button>
          ))}
        </div>
      </div>
    )}
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor="editentrydialog-f2" className="text-muted text-xs block mb-1.5">Kalorier</label>
        <input id="editentrydialog-f2" type="number" value={kcal} onChange={e => onKcalChange(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label htmlFor="editentrydialog-f3" className="text-muted text-xs block mb-1.5">Protein (g)</label>
        <input id="editentrydialog-f3" type="number" value={protein} onChange={e => onProteinChange(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label htmlFor="editentrydialog-f4" className="text-muted text-xs block mb-1.5">Kolhydrater (g)</label>
        <input id="editentrydialog-f4" type="number" value={carb} onChange={e => onCarbChange(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label htmlFor="editentrydialog-f5" className="text-muted text-xs block mb-1.5">Fett (g)</label>
        <input id="editentrydialog-f5" type="number" value={fat} onChange={e => onFatChange(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
      </div>
    </div>
    <div className="flex gap-2">
      <button onClick={onClose} className="flex-1 text-xs text-muted border border-edge rounded-lg py-2.5">Avbryt</button>
      <button onClick={onSave} disabled={saving} className="flex-1 text-xs bg-accent text-bg font-semibold py-2.5 rounded-lg disabled:opacity-50">{saving ? 'Sparar…' : 'Spara'}</button>
    </div>
    </Modal>
  )
}
