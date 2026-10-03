// Enda stället som bestämmer vilken Gemini-modell appen kör. Daniel: "Vart
// anger vi modell?" — den stod tidigare hårdkodad på nio ställen, och när
// Google avvecklade gemini-2.5-flash för nya projekt (3 okt 2026) slutade AI:n
// fungera för alla på en gång. Byt modell här (eller med miljövariabeln
// GEMINI_MODEL i Vercel, utan kodändring) — aldrig i enskilda filer.
//
// gemini-3.1-flash-lite: Googles billigaste av de nya (0,25/1,50 USD per 1 M
// tokens in/ut), testad mot riktig nyckel: svenska, JSON-schema och
// usageMetadata fungerar. Gemini 3 kan inte stänga av "tänkande" via
// thinkingBudget som 2.5; 'minimal' är lägsta nivån och ger inga tänketokens.
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite'

export function geminiUrl(model: string = GEMINI_MODEL): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

export const GEMINI_THINKING = { thinkingLevel: 'minimal' } as const
