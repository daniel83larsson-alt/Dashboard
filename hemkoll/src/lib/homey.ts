import { AthomCloudAPI } from 'homey-api'
import { createSupabaseServerClient } from './supabase-server'

// Persists the SDK's own Token shape (token_type, access_token,
// refresh_token, expires_in, grant_type) straight into
// hemkoll_homey_connections, so the SDK's built-in auto-refresh reads/writes
// through this adapter transparently — we never touch token fields by hand.
class SupabaseStorageAdapter extends AthomCloudAPI.StorageAdapter {
  constructor(private userId: string) {
    super()
  }

  async get() {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('hemkoll_homey_connections')
      .select('token')
      .eq('user_id', this.userId)
      .single()
    return data?.token ? { token: data.token } : {}
  }

  async set(value: { token?: unknown }) {
    if (!value.token) return
    const supabase = await createSupabaseServerClient()
    await supabase.from('hemkoll_homey_connections').upsert({
      user_id: this.userId,
      token: value.token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }
}

export function createHomeyCloudApi(userId: string, redirectUrl: string) {
  const clientId = process.env.HOMEY_CLIENT_ID
  const clientSecret = process.env.HOMEY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Homey är inte konfigurerat')

  return new AthomCloudAPI({
    clientId,
    clientSecret,
    redirectUrl,
    store: new SupabaseStorageAdapter(userId),
  })
}
