import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { callGemini, callAnthropic } from '@/lib/llm'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import type { YazioDay } from '@/lib/yazio-history'

const SYSTEM_PROMPT = `Du är en kortfattad, konkret kostcoach. Du får en persons matmål, dagens siffror och en sammanfattning av de senaste dagarna (alla från personens egen YAZIO-app). Ge kort, personlig feedback på svenska — max 4-5 meningar.

Regler:
- Referera till faktiska siffror, inte allmänna floskler.
- Var uppmuntrande men ärlig — säg det rakt om något sticker ut (för lite protein, ofta över målet, bra följsamhet en hel vecka osv).
- Ge högst ett konkret förslag, inte en lista.
- Aldrig medicinska råd eller diagnoser. Aldrig skambeläggande ton kring vikt eller ätande.
- Ge ALDRIG rekommendationer på specifika alkoholmärken, alkoholhaltiga drycker eller andra produkter som inte rör kost/träning.`

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    logApiCall(supabase, user.id, 'food_feedback')

    const [{ data: profile }, { data: historyRow }] = await Promise.all([
      supabase.from('profiles').select('llm_api_key_encrypted, llm_provider').eq('id', user.id).single(),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
    ])

    const historyRaw = (historyRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const history: YazioDay[] = historyRaw ? (() => {
      try { return JSON.parse(historyRaw) } catch { return [] }
    })() : []
    if (history.length === 0) {
      return NextResponse.json({ error: 'Ingen YAZIO-data att ge feedback på ännu — synka först.' }, { status: 400 })
    }

    const today = history[0]
    const weekDays = history.slice(0, 7)
    const withGoal = weekDays.filter(d => d.kcalEaten != null && d.kcalGoal != null)
    const avgEaten = withGoal.length ? Math.round(withGoal.reduce((s, d) => s + (d.kcalEaten ?? 0), 0) / withGoal.length) : null
    const avgProtein = weekDays.filter(d => d.proteinG != null).length
      ? Math.round(weekDays.reduce((s, d) => s + (d.proteinG ?? 0), 0) / weekDays.filter(d => d.proteinG != null).length)
      : null

    const dataSummary = `Dagens mål: ${today.kcalGoal ?? '?'} kcal${today.proteinGoalG != null ? `, ${today.proteinGoalG}g protein` : ''}.
Idag hittills: ${today.kcalEaten ?? 0} kcal ätit, ${today.proteinG ?? 0}g protein, ${today.carbG ?? 0}g kolhydrater, ${today.fatG ?? 0}g fett.
Senaste ${weekDays.length} dagarna: snitt ${avgEaten ?? '?'} kcal/dag (mål ${today.kcalGoal ?? '?'} kcal), snitt ${avgProtein ?? '?'}g protein/dag.
Dag-för-dag (nyast först): ${weekDays.map(d => `${d.date}: ${d.kcalEaten ?? '–'}kcal/${d.proteinG ?? '–'}g protein`).join(', ')}.`

    const userApiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : null
    const usingSharedKey = !userApiKey
    if (usingSharedKey) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
      }
    }

    const feedback = userApiKey && profile?.llm_provider === 'anthropic'
      ? await callAnthropic(userApiKey, SYSTEM_PROMPT, [], dataSummary)
      : await callGemini(userApiKey ?? process.env.GEMINI_API_KEY!, SYSTEM_PROMPT, [], dataSummary)

    return NextResponse.json({ feedback })
  } catch (err) {
    console.error('Food feedback error:', err)
    return NextResponse.json({ error: 'Kunde inte hämta feedback just nu' }, { status: 500 })
  }
}
