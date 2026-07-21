import { createSupabaseServerClient } from '@/lib/supabase-server'
import WeeklyPlanCard from '@/components/WeeklyPlanCard'
import WeeklyDigestCard from '@/components/WeeklyDigestCard'
import { startOfWeek } from '@/lib/dates'

type PlanSessionRow = {
  id: string; planned_date: string; is_rest: boolean; sport_type: string | null
  title: string; description: string; status: 'planned' | 'done' | 'skipped' | 'missed'; matched_activity_id: string | null
}

export default async function VeckoplanPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const weekStart = startOfWeek(new Date())
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekStartStr = prevWeekStart.toISOString().slice(0, 10)

  const [{ data: goals }, { data: planRow }, { data: prevPlanRow }, { data: digestRow }] = await Promise.all([
    supabase.from('goals').select('id').eq('user_id', user.id).eq('status', 'active'),
    supabase.from('training_plans').select('*, plan_sessions(*)').eq('user_id', user.id).eq('week_start', weekStartStr).maybeSingle(),
    supabase.from('training_plans').select('requested_sports').eq('user_id', user.id).eq('week_start', prevWeekStartStr).maybeSingle(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'weekly_digest').maybeSingle(),
  ])

  const digestRaw = (digestRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const digestRecord = digestRaw ? (() => { try { return JSON.parse(digestRaw) } catch { return null } })() : null

  const weeklyPlan = planRow ? {
    id: planRow.id as string,
    weekStart: planRow.week_start as string,
    planType: planRow.plan_type as 'mot_mal' | 'adaptiv',
    philosophy: planRow.philosophy as string,
    focusAreas: (planRow.focus_areas ?? []) as string[],
    sessions: ((planRow.plan_sessions ?? []) as PlanSessionRow[])
      .slice()
      .sort((a, b) => a.planned_date.localeCompare(b.planned_date)),
  } : null

  // Pre-fill the sport picker with this week's own choice if a plan already
  // exists for this week, otherwise carry over last week's choice — "vill
  // man alltid köra samma så ändrar man inget" was the explicit ask.
  const initialSports = ((planRow?.requested_sports ?? prevPlanRow?.requested_sports ?? []) as string[])

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Veckoplan</h1>
      </div>
      <WeeklyPlanCard plan={weeklyPlan} hasActiveGoal={(goals?.length ?? 0) > 0} initialSports={initialSports} />
      <div className="mt-6">
        <WeeklyDigestCard initialRecord={digestRecord} />
      </div>
    </div>
  )
}
