import { createSupabaseServerClient } from '@/lib/supabase-server'
import ProfileForm from '@/components/ProfileForm'
import GoalsCard from '@/components/GoalsCard'

export default async function ProfilPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: c2token }, { data: ctxRow }, { data: garminCredsRow }, { data: goals }, { data: overviewRow }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('concept2_tokens').select('user_id').eq('user_id', user.id).single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'user_context').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_credentials').single(),
    supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
  ])

  const savedContext = (ctxRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''
  const garminCredsRaw = (garminCredsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const hasGarmin = !!garminCredsRaw
  const savedOverview = (overviewRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''

  return (
    <div className="p-4 md:p-8 max-w-lg w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Profil</h1>
        <p className="text-muted text-sm mt-1">Inställningar och anslutningar</p>
      </div>
      <div className="mb-4">
        <GoalsCard goals={goals ?? []} savedOverview={savedOverview} />
      </div>
      <ProfileForm
        profile={profile}
        userEmail={user.email ?? ''}
        hasConcept2={!!c2token}
        hasGarmin={hasGarmin}
        savedContext={savedContext}
      />
    </div>
  )
}
