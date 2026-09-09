// Vilket kalorimål som faktiskt gäller när det finns två möjliga tal — det
// fristående manuella fältet i Profil ("Dagligt kalorimål") och Viktmåls
// uträknade budget (deficit_budget_kcal). De två kunde tidigare divergera
// helt tyst (Daniel: "På viktsidan 2150 som mål... på kostsidan 2350...
// man bör väl säga vilken som är viktigast att följa") eftersom varje yta
// läste sitt eget fält rakt av. Samma "det mer precisa/beräknade slår det
// manuella"-princip som redan finns på flera andra ställen i appen (Garmin-
// mätning > BMR-uppskattning, YAZIO > manuell logg): så länge Viktmål-
// spårning är aktiv och har en budget är DEN det gällande målet överallt —
// annars faller vi tillbaka på det manuella fältet. Rör aldrig det
// manuella värdet i databasen, bara vilket som visas.
export type CalorieGoalSource = 'deficit_budget' | 'manual'
export type EffectiveCalorieGoal = { kcal: number | null; source: CalorieGoalSource | null }

export function resolveEffectiveCalorieGoal(input: {
  dailyCalorieGoal: number | null
  deficitTrackingEnabled: boolean
  deficitBudgetKcal: number | null
}): EffectiveCalorieGoal {
  if (input.deficitTrackingEnabled && input.deficitBudgetKcal != null) {
    return { kcal: input.deficitBudgetKcal, source: 'deficit_budget' }
  }
  if (input.dailyCalorieGoal != null) return { kcal: input.dailyCalorieGoal, source: 'manual' }
  return { kcal: null, source: null }
}
