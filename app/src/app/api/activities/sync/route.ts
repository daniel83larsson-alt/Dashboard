import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { syncConcept2ForUser, Concept2NotConnectedError } from '@/lib/concept2-sync'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    logApiCall(supabase, user.id, 'concept2_sync')

    const result = await syncConcept2ForUser(supabase, user.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Concept2NotConnectedError) {
      return NextResponse.json({ error: 'Concept2 not connected' }, { status: 400 })
    }
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
