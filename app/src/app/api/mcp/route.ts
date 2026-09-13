import { extractApiKeyFromHeaders, resolveMcpAuth } from '@/lib/mcp/auth'
import { buildMcpHandler } from '@/lib/mcp/handler'

// Personal MCP connector for Daniel's own coaching conversation in
// claude.ai (see STATUS.md) — read-only, scoped to whichever profile the
// presented API key hashes to (see lib/mcp/auth.ts). No Supabase session
// check here — an MCP request from claude.ai carries no browser cookie,
// only the API key header — see this file's entry in
// route-invariants.test.ts's ALLOWLIST.
//
// Runtime notes:
// - nodejs: lib/encrypt.ts (used elsewhere in the MCP key lifecycle) and
//   the sha256 hash in lib/mcp/auth.ts need node:crypto.
// - force-dynamic: never cache an MCP response — every call is a live
//   per-user data read.
// - maxDuration 60: generous headroom for the Supabase round-trips in
//   fetchMcpUserData; actual calls are expected to finish in well under a
//   second.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handleRequest(req: Request): Promise<Response> {
  const auth = await resolveMcpAuth(extractApiKeyFromHeaders(req))
  return buildMcpHandler(auth)(req)
}

export { handleRequest as GET, handleRequest as POST }
