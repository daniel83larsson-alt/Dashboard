import { createSupabaseServerClient } from '@/lib/supabase-server'
import LoggaPassForm from '@/components/LoggaPassForm'

export default async function LoggaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('weight_kg').eq('id', user.id).single()

  return <LoggaPassForm weightKg={profile?.weight_kg ?? null} />
}
