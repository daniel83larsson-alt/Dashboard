import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/encrypt'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { generateMcpApiKey, hashMcpApiKey } from '@/lib/mcp/auth'

// Generates (or rotates) Daniel's personal MCP API key — see STATUS.md.
// ADMIN_EMAIL-gated for now: the architecture is safely multi-user by
// construction (a key only ever resolves to the profile it was generated
// for, see lib/mcp/auth.ts), so this gate is a voluntary extra precaution
// during the single-user rollout, not something the auth model depends on
// — it can be dropped later without touching that model.
//
// The raw key is returned exactly once, here. It's never stored in
// plaintext anywhere — only its sha256 hash (the lookup column) and an
// encrypted copy (so Profil can show it again, same as the Garmin
// password/LLM key) are persisted. Generating a new key immediately
// invalidates any connector using the old one.
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!process.env.ADMIN_EMAIL || user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

    const rawKey = generateMcpApiKey()

    const { error } = await supabase.from('profiles').update({
      mcp_api_key_hash: hashMcpApiKey(rawKey),
      mcp_api_key_encrypted: encrypt(rawKey),
      mcp_api_key_created_at: new Date().toISOString(),
    }).eq('id', user.id)

    if (error) {
      console.error('Save MCP key error:', error)
      return NextResponse.json({ error: 'Kunde inte spara nyckeln' }, { status: 500 })
    }

    return NextResponse.json({ key: rawKey })
  } catch (err) {
    console.error('Generate MCP key error:', err)
    return NextResponse.json({ error: 'Kunde inte generera nyckeln' }, { status: 500 })
  }
}
