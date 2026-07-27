import { NextRequest, NextResponse } from 'next/server'
import { COACHES, getCoachById, CoachId, UserContext } from '@/lib/agents/coaches'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { moderateMessage, FLAG_THRESHOLD } from '@/lib/moderation'
import { startOfWeek } from '@/lib/dates'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { fmtMinSec, sportLabel } from '@/lib/sport'
import { logApiCall } from '@/lib/log-api-call'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'

type FlagEntry = { at: string; reason: string; snippet: string }

type Message = { role: string; content: string }

// Shorter replies + a bounded slice of history — keeps both output tokens
// and input tokens (context grows with every turn otherwise) down, since
// most users share one Gemini quota. Full history still stays in the DB.
const MAX_REPLY_TOKENS = 500
const MAX_HISTORY_TURNS = 16

async function callGemini(apiKey: string, systemPrompt: string, history: Message[], message: string): Promise<string> {
  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ]
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: MAX_REPLY_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  )
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!res.ok || !text) {
    throw new Error(`Gemini call failed: ${data.error?.message ?? res.status}`)
  }
  return text
}

async function callAnthropic(apiKey: string, systemPrompt: string, history: Message[], message: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: MAX_REPLY_TOKENS,
    system: systemPrompt,
    messages: [
      ...history.slice(-MAX_HISTORY_TURNS).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ],
  })
  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  if (!text) throw new Error('Anthropic call returned no text')
  return text
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    logApiCall(supabase, user.id, 'coach')

    const { coachId, message, sport, activityId } = await request.json()
    const coach = getCoachById(coachId as CoachId)
    if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Meddelande saknas' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, llm_api_key_encrypted, llm_provider, locked, flagged_attempts, flag_log, home_equipment, selected_sports, coach_tone')
      .eq('id', user.id)
      .single()

    if (profile?.locked) {
      return NextResponse.json({
        blocked: true,
        locked: true,
        warning: 'Det här kontot är låst på grund av upprepade misstänkta meddelanden i chatten. Kontakta admin för att låsa upp.',
      })
    }

    const usingSharedKey = !profile?.llm_api_key_encrypted
    if (usingSharedKey) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) {
        return NextResponse.json({ blocked: true, warning: rateLimitMessage(rate) })
      }
    }

    const userApiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : null
    const moderationKey = userApiKey ?? process.env.GEMINI_API_KEY!
    const moderation = await moderateMessage(moderationKey, message)

    if (moderation.blocked) {
      const flaggedAttempts = (profile?.flagged_attempts ?? 0) + 1
      const prevLog = (profile?.flag_log as FlagEntry[] | null) ?? []
      const entry: FlagEntry = {
        at: new Date().toISOString(),
        reason: moderation.reason ?? 'Okänt',
        snippet: message.slice(0, 120),
      }
      const flagLog = [entry, ...prevLog].slice(0, 10)
      const shouldLock = flaggedAttempts >= FLAG_THRESHOLD

      // Service-role write, not the user's own session client: a DB trigger
      // now blocks regular users from touching these moderation columns
      // (they could otherwise self-unlock via the same RLS path), so this
      // server-decided update needs the elevated client to still go through.
      const admin = createSupabaseAdminClient()
      await admin.from('profiles').update({
        flagged_attempts: flaggedAttempts,
        flag_log: flagLog,
        locked: shouldLock,
      }).eq('id', user.id)

      return NextResponse.json({
        blocked: true,
        locked: shouldLock,
        warning: shouldLock
          ? 'Meddelandet flaggades och kontot är nu låst efter upprepade misstänkta försök. Kontakta admin för att låsa upp.'
          : `Det här meddelandet verkar inte handla om träning eller hälsa (${moderation.reason}) och har flaggats. Håll dig till tränings- och hälsorelaterade frågor — kontot låses efter ${FLAG_THRESHOLD} flaggade meddelanden.`,
      })
    }

    const [{ data: allActivities }, { data: goals }, { data: sessionData }, { data: ctxRow }, { data: overviewRow }, { data: focusRow }] = await Promise.all([
      supabase
        .from('activities')
        .select('start_date, distance, moving_time, average_heartrate, max_heartrate, average_watts, sport_type')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false })
        .limit(50),
      supabase
        .from('goals')
        .select('goal_type, title, target_date')
        .eq('user_id', user.id)
        .eq('status', 'active'),
      supabase
        .from('coach_sessions')
        .select('messages')
        .eq('user_id', user.id)
        .eq('coach_id', coachId)
        .single(),
      supabase
        .from('coach_sessions')
        .select('messages')
        .eq('user_id', user.id)
        .eq('coach_id', 'user_context')
        .single(),
      supabase
        .from('coach_sessions')
        .select('messages')
        .eq('user_id', user.id)
        .eq('coach_id', 'goals_overview')
        .single(),
      typeof activityId === 'string'
        ? supabase
            .from('activities')
            .select('id, strava_id, name, sport_type, distance, moving_time, average_heartrate, max_heartrate, raw_data')
            .eq('id', activityId)
            .eq('user_id', user.id)
            .single()
        : Promise.resolve({ data: null }),
    ])

    const acts = allActivities ?? []
    // The PR block below is fed into the prompt as "RODD-PB (endast rodd,
    // ej andra sporter)" (coaches.ts) — filter to rowing here so that claim
    // is actually true, instead of quietly mixing in another sport's best
    // effort and rendering it with rowing's /500m pace math.
    const real = acts.filter(a => a.sport_type === 'Rowing' && (a.distance ?? 0) >= 1000 && (a.moving_time ?? 0) >= 180)

    const now = new Date()
    const weekStart = startOfWeek(now)
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)

    function fmtPace(s: number, m: number) {
      if (!m) return '--'
      return `${fmtMinSec((s / m) * 500)}/500m`
    }
    function fmtDur(s: number) {
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60)
      return h > 0 ? `${h}h${m}m` : `${m}min`
    }

    const pr30 = real.filter(a => a.moving_time >= 1620 && a.moving_time <= 1980)
    const pr20 = real.filter(a => a.moving_time >= 1050 && a.moving_time <= 1350)
    const pr45 = real.filter(a => a.moving_time >= 2460 && a.moving_time <= 3000)
    const pr5k = real.filter(a => a.distance >= 4800 && a.distance <= 5200)

    const best = <T extends { distance: number; moving_time: number }>(arr: T[], by: 'dist' | 'time') =>
      arr.length ? arr.reduce((b, c) => (by === 'dist' ? c.distance > b.distance : c.moving_time < b.moving_time) ? c : b) : null

    const b30 = best(pr30, 'dist')
    const b20 = best(pr20, 'dist')
    const b45 = best(pr45, 'dist')
    const b5k = best(pr5k, 'time')

    const userBio = (ctxRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''
    const overviewGoal = (overviewRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''

    // Ett specifikt pass som chatten just nu handlar om (öppnad via "Begär
    // feedback från coachen"-knappen) — läser samma cachade delsträckor/
    // pulszoner som redan sparas av /concept2-detail och /garmin-zones
    // (fyller aldrig i själv, undviker att duplicera Garmin/Concept2-
    // inloggningslogik här; om det inte är cachat än blir focusActivity
    // bara utan den delen, inte ett fel).
    let focusActivity: string | undefined
    if (focusRow) {
      const raw = (focusRow.raw_data ?? {}) as Record<string, unknown>
      const lines = [
        `${focusRow.name} (${sportLabel(focusRow.sport_type)}), ${(focusRow.distance / 1000).toFixed(1)} km, ${fmtDur(focusRow.moving_time)}`,
      ]
      if (focusRow.average_heartrate) lines.push(`snitt-HR ${Math.round(focusRow.average_heartrate)} bpm${focusRow.max_heartrate ? `, max ${Math.round(focusRow.max_heartrate)} bpm` : ''}`)

      const hrZones = raw.hrZones as { zoneNumber: number; secsInZone: number }[] | undefined
      if (Array.isArray(hrZones) && hrZones.length) {
        const total = hrZones.reduce((s, z) => s + z.secsInZone, 0)
        if (total > 0) {
          lines.push(`pulszoner: ${hrZones.sort((a, b) => a.zoneNumber - b.zoneNumber).map(z => `Z${z.zoneNumber} ${Math.round((z.secsInZone / total) * 100)}%`).join(' ')}`)
        }
      }

      const splits = (raw.workout as { splits?: { distance: number; time: number; stroke_rate?: number; heart_rate?: { average?: number } }[] } | undefined)?.splits
      if (Array.isArray(splits) && splits.length) {
        lines.push(`delsträckor: ${splits.map(sp => {
          const pace = sp.distance ? fmtPace(sp.time / 10, sp.distance) : '--'
          const sr = sp.stroke_rate ? ` ${Math.round(sp.stroke_rate)}spm` : ''
          const hr = sp.heart_rate?.average ? ` HR${Math.round(sp.heart_rate.average)}` : ''
          return `${Math.round(sp.distance)}m ${pace}${sr}${hr}`
        }).join(', ')}`)
      }

      focusActivity = lines.join('\n')
    }

    const userContext: UserContext = {
      sport,
      name: profile?.name ?? 'Användaren',
      userBio: userBio || undefined,
      overviewGoal: overviewGoal || undefined,
      focusActivity,
      homeEquipment: profile?.home_equipment ?? undefined,
      activeSports: profile?.selected_sports ?? undefined,
      coachTone: profile?.coach_tone,
      recentActivities: acts.map(a => ({
        date: a.start_date,
        distance: a.distance,
        duration: a.moving_time,
        avgHR: a.average_heartrate ?? undefined,
        maxHR: a.max_heartrate ?? undefined,
        avgWatts: a.average_watts ?? undefined,
        sport: a.sport_type ?? undefined,
      })),
      goals: (goals ?? []).map(g => ({
        type: g.goal_type,
        title: g.title,
        targetDate: g.target_date ?? undefined,
      })),
      stats: {
        totalSessions: acts.length,
        totalDistKm: Math.round(acts.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000),
        sessionsThisWeek: acts.filter(a => new Date(a.start_date) >= weekStart).length,
        sessionsThisMonth: acts.filter(a => new Date(a.start_date) >= monthAgo).length,
      },
      prs: {
        best20min: b20 ? `${b20.distance}m (${fmtPace(b20.moving_time, b20.distance)})` : undefined,
        best30min: b30 ? `${b30.distance}m (${fmtPace(b30.moving_time, b30.distance)})` : undefined,
        best45min: b45 ? `${b45.distance}m (${fmtPace(b45.moving_time, b45.distance)})` : undefined,
        fastest5k: b5k ? `${fmtDur(b5k.moving_time)} (${fmtPace(b5k.moving_time, b5k.distance)})` : undefined,
      },
    }

    const history = (sessionData?.messages ?? []) as Message[]
    const systemPrompt = coach.systemPrompt(sport, userContext)
    const userProvider = profile?.llm_provider

    let reply: string
    if (userApiKey && userProvider === 'anthropic') {
      reply = await callAnthropic(userApiKey, systemPrompt, history, message)
    } else {
      reply = await callGemini(userApiKey ?? process.env.GEMINI_API_KEY!, systemPrompt, history, message)
    }

    const updatedMessages = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ]

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: coachId,
      messages: updatedMessages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Coach API error:', err)
    return NextResponse.json({ error: 'Coach unavailable' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(
    COACHES.map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      role: c.role,
      hasVeto: c.hasVeto,
    }))
  )
}
