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

// Samma försiktighetsprincip som Viktmåls egen TDEE-uträkning (lib/deficit.
// ts) — Garmins TRÄNINGSkalorier kan vara överskattade, så bara den delen
// rabatteras med samma deficit_garmin_correction-faktor användaren redan
// har satt för sin budget (Daniel: "bra att se det med försiktighet... så
// jag inte tummar på budgeten för att jag ser att jag bränt mer, och den
// inte stämmer"). Vilodels-/NEAT-delen av dygnet rörs inte — bara den
// aktiva/tränings-andelen, precis som deficit.ts gör med trainingKcal.
//
// ENDAST för grön/gul/röd-bedömningen av en dag (dayCalorieStatus) — den
// rena "bränt X kcal"-siffran som visas i UI:t förblir okorrigerad via
// estimateBurnedKcalForDay ovan, exakt som route-invariants.test.ts redan
// skyddar för dashboard/page.tsx:s "ätit vs bränt"-kort.
export function estimateBurnedKcalForStatus(
  bmrKcal: number,
  activityKcalForDay: number,
  garmin: { totalCalories: number | null; activeCalories: number | null },
  garminCorrection: number
): number {
  if (garmin.totalCalories != null) {
    const active = garmin.activeCalories ?? 0
    const resting = garmin.totalCalories - active
    return Math.round(resting + active * garminCorrection)
  }
  return Math.round(bmrKcal) + Math.round(activityKcalForDay * garminCorrection)
}
