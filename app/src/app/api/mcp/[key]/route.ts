import { resolveMcpAuth } from '@/lib/mcp/auth'
import { buildMcpHandler } from '@/lib/mcp/handler'

// Fallback auth for claude.ai accounts whose "Add custom connector" dialog
// has no Request-headers field yet (that field is beta/limited — see
// STATUS.md) — the key travels in the path instead of a header. Anthropic's
// own docs discourage a URL-embedded credential (it can end up in logs or
// proxies), so this route only exists as a fallback; prefer app/api/mcp/
// route.ts's header auth whenever the header field is available. Not
// listed anywhere Daniel would find on his own — the header route is the
// one to give out first.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handleRequest(req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await params
  const auth = await resolveMcpAuth(key ?? null)
  return buildMcpHandler(auth)(req)
}

export { handleRequest as GET, handleRequest as POST }
