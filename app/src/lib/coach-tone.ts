// Single source of truth for the "hur snäll/tuff ska coachen vara"
// setting (Profil) — every AI voice in the app (Coach-chatten, Insikter,
// Veckans Recap, Veckoplanens filosofi-text) appends this same instruction
// line to its own system prompt instead of each rolling its own wording,
// so the tone actually feels consistent across every place the app talks
// back to the user.
export type CoachTone = 'snall' | 'neutral' | 'tuff'

export const COACH_TONE_LABELS: Record<CoachTone, string> = {
  snall: 'Snäll',
  neutral: 'Neutral',
  tuff: 'Tuff',
}

const TONE_INSTRUCTION: Record<CoachTone, string> = {
  snall: 'TON: Var varm, uppmuntrande och stöttande. Fokusera på framsteg och det som faktiskt går bra. Var aldrig kritisk vid missade pass eller sämre resultat — hitta istället något positivt att lyfta och peppa vidare mot nästa tillfälle.',
  neutral: 'TON: Saklig, rak och balanserad — varken överdrivet mjuk eller hård. Beskriv läget som det faktiskt är, med konkreta observationer.',
  tuff: 'TON: Rak på sak och krävande. Ställ höga förväntningar, utmana till mer, och kommentera direkt när något missades eller kunde gjorts bättre — men var aldrig respektlös eller nedlåtande, bara ärlig och pushig.',
}

// Any stored value outside the three known ones (shouldn't happen given the
// DB check constraint, but a null/undefined profile field is normal for
// anyone who hasn't opened Profil since this shipped) falls back to the
// same 'neutral' behavior the app always had before this setting existed.
export function coachToneInstruction(tone: string | null | undefined): string {
  const key: CoachTone = tone === 'snall' || tone === 'tuff' ? tone : 'neutral'
  return TONE_INSTRUCTION[key]
}
