import { createSupabaseServerClient } from '@/lib/supabase-server'
import FoodLogClient, { type QuickPick, type FoodEntry } from '@/components/FoodLogClient'
import { stockholmDateKey } from '@/lib/dates'
import type { YazioDay } from '@/lib/yazio-history'

export default async function MatPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: recentLog }, { data: quickPicksRaw }, { data: yazioHistoryRow }] = await Promise.all([
    supabase.from('profiles').select('daily_calorie_goal').eq('id', user.id).single(),
    supabase.from('food_log').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(100),
    supabase.rpc('food_quick_picks'),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
  ])

  const todayKey = stockholmDateKey()
  const todayEntries = ((recentLog ?? []) as FoodEntry[]).filter(e => stockholmDateKey(new Date(e.logged_at)) === todayKey)

  const quickPicks = ((quickPicksRaw ?? []) as QuickPick[])
    .sort((a, b) => b.times_logged - a.times_logged || b.last_logged.localeCompare(a.last_logged))
    .slice(0, 12)

  const yazioHistoryRaw = (yazioHistoryRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const yazioHistory: YazioDay[] = yazioHistoryRaw ? (() => {
    try { return JSON.parse(yazioHistoryRaw) } catch { return [] }
  })() : []

  return (
    <FoodLogClient
      dailyCalorieGoal={profile?.daily_calorie_goal ?? null}
      todayEntries={todayEntries}
      quickPicks={quickPicks}
      yazioHistory={yazioHistory}
    />
  )
}
