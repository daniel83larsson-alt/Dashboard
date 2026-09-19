import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendPushToUser } from '@/lib/push'
import { explainBudgetChange, type BudgetChangeInputs } from '@/lib/deficit'
import { refreezeDeficitBudget } from '@/lib/deficit-budget-refreeze'
import { recomputeProteinGoal } from '@/lib/protein-goal-refreeze'
import { explainProteinGoalChange } from '@/lib/kost'

// Sunday night, once a week — Daniel's trigger-schedule addendum: daily
// weighing is too noisy (±0.5-1.5 kg of water/food/sodium) to recompute
// TDEE/budget on every entry, but a deliberate weekly cadence based on the
// week's rolling weight average is the right compromise. Runs regardless
// of whether a fresh weigh-in happened today ("söndag kväll oavsett") —
// refreezeDeficitBudget's rolling-average lookup already falls back
// gracefully to whatever's in the last 7 days, or the raw stored weight if
// there's nothing at all, so a missed Sunday weigh-in never skips a whole
// week's recompute. Manual triggers (delmål set/cancel, an avstämning
// applied, an admin's test button) still fire immediately from their own
// routes — untouched by this cron.
const NOTIFY_THRESHOLD_KCAL = 50
// Protein is rounded to the nearest 5g, so anything at or below one
// rounding step (5g) is noise rather than a real move — 10g (two steps)
// felt like the smallest change actually worth a notification. A judgment
// call, not derived from anything — easy to retune if it feels off.
const PROTEIN_NOTIFY_THRESHOLD_G = 10

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const { data: candidates } = await supabase
    .from('profiles')
    .select('id')
    .eq('deficit_tracking_enabled', true)

  const userIds = (candidates ?? []).map(c => c.id)

  let recomputed = 0
  let changed = 0
  let notified = 0

  await Promise.allSettled(userIds.map(async userId => {
    // alwaysLog: true — Daniel: "en post ska alltid skrivas... oavsett hur
    // liten skillnaden är, för fullständig historik." Unlike delmål/
    // avstämning/testtriggern (which only log on an actual change), this
    // scheduled run logs every week, even a no-op one.
    const result = await refreezeDeficitBudget(supabase, userId, 'stale_refresh', { alwaysLog: true })
    if (!result) return
    recomputed++
    if (!result.changed) return
    changed++

    const oldBudget = result.before?.budgetKcal ?? null
    const newBudget = result.after.budgetKcal
    const diffKcal = oldBudget != null ? newBudget - oldBudget : null

    // Pling bara vid >50 kcal skillnad — mindre justeringar uppdateras
    // tyst (redan loggade ovan, syns i historikvyn om man letar, men stör
    // inte med en notis varje vecka för marginella justeringar).
    if (diffKcal == null || Math.abs(diffKcal) <= NOTIFY_THRESHOLD_KCAL) return

    // Diffar mot den händelse som gällde INNAN den här körningen (index 1 —
    // index 0 är den refreezeDeficitBudget precis skrev), för en läsbar
    // anledning istället för bara två siffror (Daniel: "notisen ska
    // innehålla en läsbar anledning, inte bara siffror").
    const { data: recentEvents } = await supabase
      .from('deficit_budget_events')
      .select('bmr_kcal, training_kcal, neat_factor, garmin_correction')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(2)
    const previousInputs: BudgetChangeInputs | null = recentEvents?.[1]
      ? {
          bmrKcal: recentEvents[1].bmr_kcal, trainingKcal: recentEvents[1].training_kcal,
          neatFactor: recentEvents[1].neat_factor, garminCorrection: recentEvents[1].garmin_correction,
        }
      : null
    const explanation = explainBudgetChange(result.after.explainInputs, previousInputs)

    const pushResult = await sendPushToUser(supabase, userId, {
      title: `Budgeten ${diffKcal > 0 ? 'höjdes' : 'sänktes'} till ${newBudget} kcal`,
      body: `Tidigare ${oldBudget} kcal.${explanation ? ` Anledning: ${explanation}.` : ''}`,
      url: '/dashboard/viktmal',
    })
    if (pushResult.sent > 0) notified++
  }))

  // Separate pass, separate candidate list — protein auto-mode is NOT
  // gated by deficit_tracking_enabled (Daniel's own account has it on, but
  // the feature should work for anyone who hasn't pinned a manual value,
  // whether or not they're also running Viktmål). Unlike the budget loop
  // above, this only logs on an actual gram change ("en ÄNDRING i
  // beräknat proteinmål ska loggas" — no weekly no-op row).
  const { data: proteinCandidates } = await supabase
    .from('profiles')
    .select('id')
    .eq('protein_goal_mode', 'auto')
  const proteinUserIds = (proteinCandidates ?? []).map(c => c.id)

  let proteinRecomputed = 0
  let proteinChanged = 0
  let proteinNotified = 0

  await Promise.allSettled(proteinUserIds.map(async userId => {
    const result = await recomputeProteinGoal(supabase, userId)
    if (!result) return
    proteinRecomputed++
    if (!result.changed) return
    proteinChanged++

    const diffG = result.newGoalG - (result.oldGoalG ?? result.newGoalG)
    if (Math.abs(diffG) <= PROTEIN_NOTIFY_THRESHOLD_G) return

    const explanation = explainProteinGoalChange({ oldGoalG: result.oldGoalG, newGoalG: result.newGoalG, weightKg: result.weightUsedKg })
    const pushResult = await sendPushToUser(supabase, userId, {
      title: `Proteinmål ${diffG > 0 ? 'höjdes' : 'sänktes'} till ${result.newGoalG}g`,
      body: explanation,
      url: '/dashboard/profil',
    })
    if (pushResult.sent > 0) proteinNotified++
  }))

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    candidates: userIds.length, recomputed, changed, notified,
    protein: { candidates: proteinUserIds.length, recomputed: proteinRecomputed, changed: proteinChanged, notified: proteinNotified },
  })
}
