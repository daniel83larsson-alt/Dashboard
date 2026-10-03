// Daniel: "redigera kcal och protein på en sparad rätt ... uppdatera innehållet
// och spara den." Snabbvalen härleds ur matloggen (senast loggade rad per
// namn), så en redigering får aldrig skriva om redan loggade måltider — den
// sparas i food_quick_pick_overrides och gäller bara FRAMTIDA loggningar av
// rätten. Ren validering här så API-routen och testerna delar samma regler.
export type ParsedOverride = { ok: true; name: string; calories: number; proteinG: number | null } | { ok: false; error: string }

export function parseQuickPickOverride(body: unknown): ParsedOverride {
  const b = (body ?? {}) as { name?: unknown; calories?: unknown; proteinG?: unknown }
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 200) : ''
  if (!name) return { ok: false, error: 'Namn saknas' }

  const calories = typeof b.calories === 'number' ? b.calories : Number.NaN
  if (!Number.isFinite(calories) || calories <= 0 || calories > 4000) return { ok: false, error: 'Kalorier måste vara mellan 1 och 4000' }

  let proteinG: number | null = null
  if (b.proteinG != null && b.proteinG !== '') {
    const p = typeof b.proteinG === 'number' ? b.proteinG : Number.NaN
    if (!Number.isFinite(p) || p < 0 || p > 400) return { ok: false, error: 'Protein måste vara mellan 0 och 400 g' }
    proteinG = Math.round(p * 10) / 10
  }
  return { ok: true, name, calories: Math.round(calories), proteinG }
}
