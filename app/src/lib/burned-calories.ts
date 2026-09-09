// Samma modell som Översikts "Kalorier idag"-kort (dashboard/page.tsx) —
// Garmins uppmätta dygnsförbränning när den finns för dagen, annars BMR plus
// den dagens loggade träning. Till skillnad från dagens kort (som bara
// räknar den andel av dygnet som redan gått) räknas hela dygnets BMR här,
// eftersom detta bara används för dagar som redan är över (Kost-sidans
// historiska dagslistor — Daniel: "smidigt om totalt förbränt loggades där
// med").
export type BurnedKcalSource = 'garmin' | 'estimate'

export function estimateBurnedKcalForDay(
  bmrKcal: number,
  activityKcalForDay: number,
  garminTotalCaloriesForDay: number | null
): { kcal: number; source: BurnedKcalSource } {
  if (garminTotalCaloriesForDay != null) return { kcal: garminTotalCaloriesForDay, source: 'garmin' }
  return { kcal: Math.round(bmrKcal) + activityKcalForDay, source: 'estimate' }
}
