// Pure: builds get_budget_history(days)'s exact JSON payload — "varför
// ändrades min budget", the same question ViktmalClient's own
// Budgethistorik card already answers in the UI, now exposed over MCP.
import { explainBudgetChange } from '@/lib/deficit'
import type { McpBudgetHistoryRow } from './fetch-budget-history'

export type BudgetHistoryEntry = {
  date: string // YYYY-MM-DD
  kind: string
  kind_label: string
  old_budget_kcal: number | null
  new_budget_kcal: number | null
  new_tdee_kcal: number | null
  reason: string | null
}

export type BudgetHistory = {
  period_days: number
  events: BudgetHistoryEntry[]
}

// Same Swedish labels as ViktmalClient.tsx's EVENT_KIND_LABEL, minus
// protein_goal_changed (excluded upstream in fetch-budget-history.ts) —
// duplicated rather than shared, matching this app's established
// small-UI-constant convention (a client component can't import from an
// MCP-only lib module anyway).
const KIND_LABELS: Record<string, string> = {
  settings_changed: 'Inställning ändrad',
  checkin_applied: 'Avstämning applicerad',
  milestone_set: 'Delmål satt',
  milestone_expired: 'Delmål utgånget',
  milestone_reached: 'Delmål nått',
  milestone_cancelled: 'Delmål avbrutet',
  override_acknowledged: 'Override bekräftad',
  override_voided: 'Override upphävd',
  stale_refresh: 'Veckovis omräkning (söndag)',
  manual_test: 'Test-omräkning (admin)',
}

export function computeBudgetHistory(events: McpBudgetHistoryRow[], days: number, todayKey: string): BudgetHistory {
  // Sorted oldest-first, and explained BEFORE windowing — the event just
  // before the requested window is still needed to explain the first
  // visible change inside it (same reason fetch-budget-history.ts fetches
  // unbounded rather than pre-filtered by date).
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const windowStartIso = new Date(new Date(`${todayKey}T00:00:00`).getTime() - days * 86400000).toISOString()

  const reasons = sorted.map((ev, i) => {
    const previous = i > 0 ? sorted[i - 1] : null
    return explainBudgetChange(
      { bmrKcal: ev.bmrKcal, trainingKcal: ev.trainingKcal, neatFactor: ev.neatFactor, garminCorrection: ev.garminCorrection },
      previous ? { bmrKcal: previous.bmrKcal, trainingKcal: previous.trainingKcal, neatFactor: previous.neatFactor, garminCorrection: previous.garminCorrection } : null
    )
  })

  const entries: BudgetHistoryEntry[] = sorted
    .map((ev, i) => ({
      date: ev.createdAt.slice(0, 10),
      kind: ev.kind,
      kind_label: KIND_LABELS[ev.kind] ?? ev.kind,
      old_budget_kcal: ev.oldBudgetKcal,
      new_budget_kcal: ev.newBudgetKcal,
      new_tdee_kcal: ev.newTdeeKcal,
      reason: reasons[i],
    }))
    .filter((_, i) => sorted[i].createdAt >= windowStartIso)

  return { period_days: days, events: entries }
}
