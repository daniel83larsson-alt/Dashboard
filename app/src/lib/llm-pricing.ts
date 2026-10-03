// Ungefärlig AI-kostnad per användare (Daniel: "ha en kostnadskolumn i admin,
// per person och totalt ... underlag om man vill att någon ska betala för
// sig"). Tokens sparas i llm_usage; kronor räknas först här, så priser och
// växelkurs kan ändras utan att historiken skrivs om. Det är en UPPSKATTNING
// — Googles faktura är facit. Priser: USD per 1 M tokens (in, ut), enligt
// Googles prissida 3 okt 2026. "Tänkande" debiteras som utdata.
export const GEMINI_PRICES_USD: Record<string, { in: number; out: number }> = {
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.5 },
  'gemini-3.5-flash-lite': { in: 0.3, out: 2.5 },
  'gemini-3.5-flash': { in: 1.5, out: 9 },
  'gemini-3.6-flash': { in: 0.75, out: 3.75 },
  'gemini-3.7-flash': { in: 0.75, out: 3.75 },
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
}

// Okänd modell → dyraste kända priset, hellre för högt än för lågt.
const FALLBACK_PRICE = { in: 1.5, out: 9 }

export const USD_SEK_RATE = Number(process.env.USD_SEK_RATE) > 0 ? Number(process.env.USD_SEK_RATE) : 10

export function costSek(model: string, inputTokens: number, outputTokens: number, usdSek: number = USD_SEK_RATE): number {
  const p = GEMINI_PRICES_USD[model] ?? FALLBACK_PRICE
  return ((inputTokens * p.in + outputTokens * p.out) / 1_000_000) * usdSek
}

export function fmtSek(sek: number): string {
  if (sek <= 0) return '0 kr'
  if (sek < 0.01) return '<0,01 kr'
  if (sek < 1) return `${sek.toFixed(2).replace('.', ',')} kr`
  if (sek < 100) return `${sek.toFixed(1).replace('.', ',')} kr`
  return `${Math.round(sek)} kr`
}

export type UsageStatsRow = {
  user_id: string; model: string; own_key: boolean
  calls_30d: number; input_30d: number; output_30d: number
  calls_all: number; input_all: number; output_all: number
}

export type UserCost = { calls30d: number; sek30d: number; callsAll: number; sekAll: number; ownKeyCalls30d: number }

// Summerar raderna (en per användare × modell × egen-nyckel) till en post per
// användare plus totalen. Anrop med EGEN nyckel betalas av användaren själv och
// räknas därför inte in i kostnaden, bara i antalet anrop.
export function summarizeUsage(rows: UsageStatsRow[], usdSek: number = USD_SEK_RATE): { byUser: Map<string, UserCost>; total: UserCost } {
  const byUser = new Map<string, UserCost>()
  const total: UserCost = { calls30d: 0, sek30d: 0, callsAll: 0, sekAll: 0, ownKeyCalls30d: 0 }
  for (const r of rows) {
    const u = byUser.get(r.user_id) ?? { calls30d: 0, sek30d: 0, callsAll: 0, sekAll: 0, ownKeyCalls30d: 0 }
    const c30 = r.own_key ? 0 : costSek(r.model, Number(r.input_30d), Number(r.output_30d), usdSek)
    const cAll = r.own_key ? 0 : costSek(r.model, Number(r.input_all), Number(r.output_all), usdSek)
    for (const t of [u, total]) {
      t.calls30d += Number(r.calls_30d); t.callsAll += Number(r.calls_all)
      t.sek30d += c30; t.sekAll += cAll
      if (r.own_key) t.ownKeyCalls30d += Number(r.calls_30d)
    }
    byUser.set(r.user_id, u)
  }
  return { byUser, total }
}
