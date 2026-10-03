import { createSupabaseAdminClient } from './supabase-admin'
import { GEMINI_MODEL } from './llm-model'

// Loggar token-förbrukning per AI-anrop till llm_usage (kostnad per användare
// i admin, se lib/llm-pricing.ts). Sparar ALDRIG frågornas eller svarens
// innehåll — bara antal tokens. Fire-and-forget: ett loggfel får aldrig
// stoppa själva AI-anropet. Skriver med service-role eftersom tabellen
// saknar policys (varken inloggade användare eller anon kan skriva/läsa).
export type UsageContext = { userId?: string | null; feature: string; apiKey: string }

type GeminiUsageMetadata = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }

export function parseGeminiUsage(data: unknown): { input: number; output: number; thinking: number } | null {
  const m = (data as { usageMetadata?: GeminiUsageMetadata } | null)?.usageMetadata
  if (!m || typeof m.promptTokenCount !== 'number') return null
  return { input: m.promptTokenCount, output: m.candidatesTokenCount ?? 0, thinking: m.thoughtsTokenCount ?? 0 }
}

// Egen nyckel = användaren har sparat en egen i Profil, dvs nyckeln som
// användes är inte appens gemensamma. Då betalar användaren själv.
export function isOwnKey(apiKey: string): boolean {
  return !!apiKey && apiKey !== process.env.GEMINI_API_KEY
}

export function recordGeminiUsage(data: unknown, ctx: UsageContext): void {
  try {
    const usage = parseGeminiUsage(data)
    if (!usage || !ctx.userId) return
    createSupabaseAdminClient().from('llm_usage').insert({
      user_id: ctx.userId,
      feature: ctx.feature,
      model: GEMINI_MODEL,
      input_tokens: usage.input,
      output_tokens: usage.output,
      thinking_tokens: usage.thinking,
      own_key: isOwnKey(ctx.apiKey),
    }).then(() => {}, () => {})
  } catch {
    // logging must never break the request
  }
}
