// Tre lägen för en enskild loggad dag, istället för det gamla "klarade
// budget / missade budget"-tvåläget (Daniel: "Klarar budget, grönt. Under
// TDEE gult, äter mer än TDEE rött."). Missar man den snävare
// Viktmål-budgeten en dag men äter ändå mindre än man faktiskt förbrände
// (bränt/TDEE) är det fortfarande en riktig deficit-dag — bara inte lika
// aggressiv som planerat. Först när man äter MER än man förbränt går man
// faktiskt bakåt.
export type DayCalorieStatus = 'goal_met' | 'under_burned' | 'over_burned'

export function dayCalorieStatus(eatenKcal: number, calorieGoal: number, burnedKcal: number): DayCalorieStatus {
  if (eatenKcal <= calorieGoal) return 'goal_met'
  if (eatenKcal <= burnedKcal) return 'under_burned'
  return 'over_burned'
}

export const DAY_CALORIE_STATUS_TEXT_COLOR: Record<DayCalorieStatus, string> = {
  goal_met: 'text-green-400',
  under_burned: 'text-amber-500',
  over_burned: 'text-red-400',
}

export const DAY_CALORIE_STATUS_BG: Record<DayCalorieStatus, string> = {
  goal_met: 'bg-green-400/10 text-fg',
  under_burned: 'bg-amber-500/10 text-fg',
  over_burned: 'bg-red-400/10 text-fg',
}

export const DAY_CALORIE_STATUS_LABEL: Record<DayCalorieStatus, string> = {
  goal_met: 'Klarar budget',
  under_burned: 'Under förbränning',
  over_burned: 'Över förbränning',
}
