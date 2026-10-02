// Daniel: "ändra texten så att man vet att kvoten är slut. Och man får vänta
// lite." Gemini-nyckeln ligger på gratisnivå (20 anrop/dygn totalt) och ger då
// ett fel med "exceeded your current quota ... Please retry in 3h17m56s".
// Koden visade tidigare ett missvisande "Kontrollera att API-nyckeln är
// inlagd" — den här modulen känner igen kvotfelet och skriver en ärlig text.

export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|\b429\b/i.test(msg)
}

// "Please retry in 3h17m56.57s" / "retry in 45.2s" → minuter (avrundat uppåt), annars null.
export function retryAfterMinutes(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  const m = /retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i.exec(msg)
  if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null
  const secs = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return Math.max(1, Math.ceil(secs / 60))
}

function waitText(minutes: number | null): string {
  if (minutes == null) return 'Försök igen om en stund.'
  if (minutes < 2) return 'Försök igen om en minut.'
  if (minutes < 60) return `Försök igen om ungefär ${minutes} minuter.`
  const h = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `Försök igen om ungefär ${h} ${h === 1 ? 'timme' : 'timmar'}${rest >= 10 ? ` och ${rest} minuter` : ''}.`
}

export function quotaMessage(err: unknown): string {
  return `AI-kvoten för idag är slut, så det går inte att få svar just nu — det är inget fel på din inloggning eller nyckel. ${waitText(retryAfterMinutes(err))}`
}
