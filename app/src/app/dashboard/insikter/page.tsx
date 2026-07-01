import { createSupabaseServerClient } from '@/lib/supabase-server'
import InsightsPanel from '@/components/InsightsPanel'
import WellnessCharts from '@/components/WellnessCharts'

export default async function InsikterPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: insightRow }, { data: wellnessRow }, { count: activityCount }] = await Promise.all([
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'insights').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const insightRaw = (insightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedInsight = insightRaw ? (() => { try { return JSON.parse(insightRaw) } catch { return null } })() : null

  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
  const wellnessHistory = wellnessStore?.history ?? []

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Insikter</h1>
        <p className="text-muted text-sm mt-1">Hela tränarteamet analyserar din träning</p>
      </div>

      {wellnessHistory.length > 0 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Wellness · {wellnessHistory.length} dagar</h2>
          <WellnessCharts history={wellnessHistory} />
        </div>
      )}

      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Tränarteamets analys</h2>
        <InsightsPanel savedInsight={savedInsight} activityCount={activityCount ?? 0} />
      </div>
    </div>
  )
}
