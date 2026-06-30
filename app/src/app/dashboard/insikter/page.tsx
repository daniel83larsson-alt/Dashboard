import { createSupabaseServerClient } from '@/lib/supabase-server'
import InsightsPanel from '@/components/InsightsPanel'

export default async function InsikterPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: insightRow } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', user.id)
    .eq('coach_id', 'insights')
    .single()

  const raw = (insightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedInsight = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Insikter</h1>
        <p className="text-muted text-sm mt-1">Hela tränarteamet analyserar din träning</p>
      </div>
      <InsightsPanel savedInsight={savedInsight} />
    </div>
  )
}
