export type LlmMessage = { role: string; content: string }

// Shared by every place in the app that talks to an LLM (sport coaches,
// nutrition feedback, ...) — one place to change the model, token cap, or
// provider-selection logic instead of drifting between call sites.
const MAX_REPLY_TOKENS = 500
const MAX_HISTORY_TURNS = 16

export async function callGemini(apiKey: string, systemPrompt: string, history: LlmMessage[], message: string): Promise<string> {
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

export async function callAnthropic(apiKey: string, systemPrompt: string, history: LlmMessage[], message: string): Promise<string> {
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
