import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'
import { stockholmDateKey } from '@/lib/dates'
import { resolveEffectiveCalorieGoal } from '@/lib/calorie-goal'
import { normalizeYazioDay, type YazioDay } from '@/lib/yazio-history'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Minsta rimliga kvarvarande utrymme att bygga ett förslag kring — under
// det är svaret ändå bara "ät nästan inget", inte värt ett AI-anrop.
const MIN_REMAINING_KCAL = 100
// Håller prompten kompakt — de mest loggade rätterna räcker gott för två
// upplägg, och en lång lista gör det bara svårare för AI:n att hålla sig
// till listan istället för att hitta på nya rätter.
const MAX_QUICK_PICKS_IN_PROMPT = 25

const SYSTEM_PROMPT = `Du är en kortfattad, konkret kostcoach. Du får en lista med personens EGNA vanligast loggade rätter (namn, kcal och protein per portion) och hur mycket kcal/protein personen har kvar att äta idag. Föreslå två upplägg för RESTEN av dagen — använd ENDAST rätter från listan (ange gärna fler/färre portioner av samma rätt, t.ex. "2x" eller "halv portion", men hitta ALDRIG på en rätt som inte finns i listan):

- "minimal": så få kcal som möjligt som ändå täcker kvarvarande protein rimligt väl — enkelt och hanterbart, inte fler rätter än nödvändigt.
- "maxed": så mycket mat/kcal som möjligt UTAN att gå över kvarvarande kcal — för den som vill känna sig mätt.

Regler:
- Överskrid ALDRIG kvarvarande kcal i något av de två upplägget.
- Sikta på att täcka kvarvarande protein om det är angivet, men gå aldrig över kcal-gränsen för att pressa in mer protein.
- "note" per upplägg: max en kort mening, konkret (t.ex. "Täcker proteinbehovet med minsta möjliga kcal").
- Svara ENDAST med JSON enligt schema.
- Aldrig medicinska råd eller diagnoser. Aldrig rekommendationer på alkoholhaltiga drycker.`

type PlanItem = { name: string; portion: string; kcal: number; proteinG: number }
type PlanOption = { note: string; items: PlanItem[]; totalKcal: number; totalProteinG: number }

async function callGeminiForPlan(apiKey: string, question: string): Promise<{ minimal: PlanOption; maxed: PlanOption }> {
  const planOptionSchema = {
    type: 'OBJECT',
    properties: {
      note: { type: 'STRING' },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            portion: { type: 'STRING' },
            kcal: { type: 'NUMBER' },
            proteinG: { type: 'NUMBER' },
          },
          required: ['name', 'portion', 'kcal', 'proteinG'],
        },
      },
      totalKcal: { type: 'NUMBER' },
      totalProteinG: { type: 'NUMBER' },
    },
    required: ['note', 'items', 'totalKcal', 'totalProteinG'],
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: question }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        maxOutputTokens: 900,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { minimal: planOptionSchema, maxed: planOptionSchema },
          required: ['minimal', 'maxed'],
        },
      },
    }),
  })
  const d = await res.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Tomt svar från Gemini')
  return JSON.parse(text)
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    logApiCall(supabase, user.id, 'food_plan_suggestion')

    const todayKey = stockholmDateKey()
    const todayStartIso = new Date(`${todayKey}T00:00:00`).toISOString()

    const [{ data: profile }, { data: quickPicksRaw }, { data: todayLog }, { data: yazioHistoryRow }] = await Promise.all([
      supabase.from('profiles').select('llm_api_key_encrypted, llm_provider, daily_calorie_goal, deficit_tracking_enabled, deficit_budget_kcal, protein_goal_g').eq('id', user.id).single(),
      supabase.rpc('food_quick_picks'),
      supabase.from('food_log').select('calories, protein_g, logged_at').eq('user_id', user.id).gte('logged_at', todayStartIso),
      supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_history').single(),
    ])

    const effectiveGoal = resolveEffectiveCalorieGoal({
      dailyCalorieGoal: profile?.daily_calorie_goal ?? null,
      deficitTrackingEnabled: profile?.deficit_tracking_enabled ?? false,
      deficitBudgetKcal: profile?.deficit_budget_kcal ?? null,
    })
    if (effectiveGoal.kcal == null) {
      return NextResponse.json({ error: 'Inget kalorimål satt — ange ett i Profil eller sätt upp ett viktmål först.' }, { status: 400 })
    }

    const yazioHistoryRaw = (yazioHistoryRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const yazioHistory: YazioDay[] = yazioHistoryRaw ? (() => {
      try {
        const parsed = JSON.parse(yazioHistoryRaw)
        return Array.isArray(parsed) ? parsed.map(normalizeYazioDay) : []
      } catch { return [] }
    })() : []
    const yazioToday = yazioHistory[0]?.date === todayKey ? yazioHistory[0] : null

    // Samma "YAZIO vinner om den finns, annars manuell logg"-princip som
    // resten av appen redan använder (dashboard/page.tsx, day-nutrition-
    // source.ts) — aldrig summera båda.
    type TodayLogRow = { calories: number | null; protein_g: number | null; logged_at: string }
    const manualEntries = (todayLog ?? []) as TodayLogRow[]
    const eatenKcal = yazioToday?.kcalEaten ?? manualEntries.reduce((s, e) => s + (e.calories ?? 0), 0)
    const eatenProteinG = yazioToday?.proteinG ?? manualEntries.reduce((s, e) => s + (e.protein_g ?? 0), 0)

    const remainingKcal = effectiveGoal.kcal - eatenKcal
    if (remainingKcal < MIN_REMAINING_KCAL) {
      return NextResponse.json({ error: 'Du har redan nått (eller passerat) dagens kalorimål — inget nämnvärt utrymme kvar att planera för idag.' }, { status: 400 })
    }
    const remainingProteinG = profile?.protein_goal_g != null ? Math.max(0, profile.protein_goal_g - eatenProteinG) : null

    type QuickPick = { name: string; calories: number; protein_g: number | null; times_logged: number }
    const quickPicks = ((quickPicksRaw ?? []) as QuickPick[])
      .filter(q => q.calories > 0)
      .sort((a, b) => b.times_logged - a.times_logged)
      .slice(0, MAX_QUICK_PICKS_IN_PROMPT)
    if (quickPicks.length < 3) {
      return NextResponse.json({ error: 'Logga lite fler favoriträtter först — behöver minst några vanliga rätter att bygga förslag från.' }, { status: 400 })
    }

    const picksList = quickPicks.map(q => `- ${q.name}: ${q.calories} kcal${q.protein_g != null ? `, ${Math.round(q.protein_g)}g protein` : ''}`).join('\n')
    const question = `MINA VANLIGASTE RÄTTER (per portion som jag brukar logga dem):\n${picksList}\n\nKVAR ATT ÄTA IDAG: ${remainingKcal} kcal${remainingProteinG != null ? `, ${Math.round(remainingProteinG)}g protein` : ' (inget proteinmål satt)'}.`

    const userApiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : null
    const usingSharedKey = !userApiKey
    if (usingSharedKey) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
      }
    }

    const plan = await callGeminiForPlan(userApiKey ?? process.env.GEMINI_API_KEY!, question)
    return NextResponse.json({ ...plan, remainingKcal, remainingProteinG })
  } catch (err) {
    console.error('Food plan suggestion error:', err)
    return NextResponse.json({ error: 'Kunde inte ta fram ett förslag just nu' }, { status: 500 })
  }
}
