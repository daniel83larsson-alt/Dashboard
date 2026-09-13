import { randomBytes, createHash } from 'crypto'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

// A personal, static API key for Daniel's own coaching-conversation MCP
// connector (see STATUS.md) — deliberately NOT OAuth. claude.ai's "Add
// custom connector" dialog probes the URL and pre-fills the detected auth
// mode; if that probe gets a 401 it starts OAuth discovery and fails with
// "Couldn't reach the MCP server" since there's no authorization server
// here. So this module must NEVER cause a 401/WWW-Authenticate response —
// callers turn a null resolveMcpAuth() result into a normal 200 MCP tool
// error instead, never an HTTP error status.
const KEY_PREFIX = 'dlt_'

export function generateMcpApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString('base64url')
}

export function hashMcpApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

// Bearer/X-Api-Key header, whichever is present — the path-segment variant
// (app/api/mcp/[key]/route.ts) passes its key in directly instead of
// calling this.
export function extractApiKeyFromHeaders(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null
  const apiKeyHeader = req.headers.get('x-api-key')
  if (apiKeyHeader?.trim()) return apiKeyHeader.trim()
  return null
}

// The ONLY place a raw key is turned into a user id. Uses the service-role
// client because an MCP request carries no Supabase session/cookie —
// there is nothing else to check RLS against. That's exactly why every
// query built on this result must filter `.eq('user_id', userId)` itself;
// this function's only security property is that the hash lookup can never
// return a DIFFERENT user's id than the one whose raw key was presented
// (enforced by the unique index on profiles.mcp_api_key_hash — see
// supabase/schema.sql).
export async function resolveMcpAuth(rawKey: string | null): Promise<{ userId: string } | null> {
  if (!rawKey) return null
  const hash = hashMcpApiKey(rawKey)
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('profiles').select('id').eq('mcp_api_key_hash', hash).maybeSingle()
  return data ? { userId: data.id } : null
}
