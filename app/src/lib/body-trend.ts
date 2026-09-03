// The scale-plateau-but-waist-still-shrinking reassurance (idea #5's
// companion rule): weight is noisy (water, salt, hormones), waist is a
// second, mostly-independent signal. Pure rule, no AI, no I/O.

const WEIGHT_FLAT_WINDOW_DAYS = 21
const WAIST_DROP_THRESHOLD_CM = 1

export type BodyTrendNote = { kind: 'waist_progressing_despite_flat_weight'; waistDropCm: number } | null

export function detectBodyTrendNote(input: {
  weighIns: { date: string; weightKg: number }[] // sorted or not, any order
  waistMeasurements: { date: string; waistCm: number }[]
  todayKey: string
}): BodyTrendNote {
  const { weighIns, waistMeasurements, todayKey } = input
  const windowStart = (() => {
    const d = new Date(`${todayKey}T00:00:00`)
    d.setDate(d.getDate() - WEIGHT_FLAT_WINDOW_DAYS)
    return d.toISOString().slice(0, 10)
  })()

  const weightsInWindow = weighIns.filter(w => w.date >= windowStart && w.date <= todayKey).sort((a, b) => a.date.localeCompare(b.date))
  const waistInWindow = waistMeasurements.filter(w => w.date >= windowStart && w.date <= todayKey).sort((a, b) => a.date.localeCompare(b.date))
  if (weightsInWindow.length < 2 || waistInWindow.length < 2) return null

  const weightDelta = weightsInWindow[weightsInWindow.length - 1].weightKg - weightsInWindow[0].weightKg
  const waistDelta = waistInWindow[waistInWindow.length - 1].waistCm - waistInWindow[0].waistCm

  // "Flat or up" on the scale, but waist has meaningfully gone down.
  if (weightDelta >= 0 && waistDelta <= -WAIST_DROP_THRESHOLD_CM) {
    return { kind: 'waist_progressing_despite_flat_weight', waistDropCm: Math.round(Math.abs(waistDelta) * 10) / 10 }
  }
  return null
}

export function bodyTrendNoteLabel(note: NonNullable<BodyTrendNote>): string {
  return `Vågen står stilla men midjemåttet har gått ner ${note.waistDropCm.toFixed(1).replace('.', ',')} cm — fettförlusten fortsätter.`
}
