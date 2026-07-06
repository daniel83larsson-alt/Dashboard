// Default AI engine for the whole portfolio is Gemini (paid by Daniel,
// GEMINI_API_KEY), called directly over REST with no SDK — same pattern as
// app/ (DL Trainer). A future "bring your own Anthropic key" option per
// user (like DL Trainer's coach/insights features) is not built yet; this
// is the single place that would branch on a stored user key.

export interface ReceiptAiSuggestion {
  beskrivning: string;
  datum: string;
  belopp: number;
  konto: string;
  typ: "kostnad" | "intakt";
  moms: number;
}

const GEMINI_MODEL = "gemini-2.5-flash";

export async function parseReceiptWithAI(
  imageBytes: Buffer,
  mimeType: string,
  kontoplan: string
): Promise<ReceiptAiSuggestion> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("AI-tolkning är inte konfigurerad (GEMINI_API_KEY saknas).");
  }

  const prompt =
    "Läs kvittot på bilden. Föreslå bokföring för en svensk enskild firma.\n" +
    "Tillgänglig kontoplan:\n" +
    kontoplan +
    '\n\nSvara ENDAST med JSON på formen: {"beskrivning":"leverantörsnamn","datum":"YYYY-MM-DD","belopp":123.45,"konto":"6110","typ":"kostnad","moms":25}\n' +
    "belopp är totalbeloppet inkl. moms. moms är momssatsen i procent (0, 6, 12 eller 25). Gissa rimligt datum om det inte syns tydligt.";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBytes.toString("base64") } },
              { text: prompt },
            ],
          },
        ],
        // This is a structured-extraction task, not reasoning -- thinking
        // tokens add cost/latency for no benefit here, and were observed to
        // occasionally crowd out the actual JSON answer within the output
        // budget. Disabling it also stretches a free-tier daily quota further.
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const detail = errBody?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini svarade med fel: ${detail}`);
  }

  const body = await res.json();
  const text: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Inget textsvar från AI:n.");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Kunde inte tolka AI-svaret.");

  return JSON.parse(jsonMatch[0]) as ReceiptAiSuggestion;
}
