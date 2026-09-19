// Pure sanitization for the "Logga pass" exercise picker's structured
// per-exercise data (Daniel: "skulle vilja ange vikt också... generellt på
// all typ av träning") — untrusted client input, never trusted as-is.
// Extracted out of the route handler so the validation rules themselves
// are testable without mocking Supabase/Next.js.
export type ManualExercise = { name: string; sets: number; reps: number; weightKg: number | null }

// 12 = double the largest EXERCISES_BY_SPORT list on the client
// (LoggaPassForm.tsx), enough headroom without letting a manipulated
// request stuff an unbounded array into raw_data.
const MAX_EXERCISES = 12

export function sanitizeManualExercises(input: unknown): ManualExercise[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_EXERCISES).map(e => {
    if (typeof e !== 'object' || e === null) return null
    const row = e as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 60) : null
    const sets = typeof row.sets === 'number' && Number.isFinite(row.sets) ? Math.min(50, Math.max(1, Math.round(row.sets))) : null
    const reps = typeof row.reps === 'number' && Number.isFinite(row.reps) ? Math.min(500, Math.max(1, Math.round(row.reps))) : null
    const weightKg = typeof row.weightKg === 'number' && Number.isFinite(row.weightKg) ? Math.min(500, Math.max(0, row.weightKg)) : null
    return name && sets && reps ? { name, sets, reps, weightKg } : null
  }).filter((e): e is ManualExercise => e != null)
}
