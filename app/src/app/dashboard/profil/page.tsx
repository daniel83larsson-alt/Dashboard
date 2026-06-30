import { createSupabaseServerClient } from '@/lib/supabase'
import ProfileForm from '@/components/ProfileForm'

export default async function ProfilPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: c2token }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('concept2_tokens').select('user_id').eq('user_id', user.id).single(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-lg w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Profil</h1>
        <p className="text-muted text-sm mt-1">Inställningar och anslutningar</p>
      </div>
      <ProfileForm
        profile={profile}
        userEmail={user.email ?? ''}
        hasConcept2={!!c2token}
      />
    </div>
  )
}
