# iCore step contract — reference example

Konkret, körbar kod till diskussionen om att bryta upp en integration i
oberoende, versionerade steg: **Inbound → Mappning → Förädling → Mappning
→ Outbound**. De två Mappnings-stegen är det som redan finns i
`../mapping-engine.html` (deklarativt, ingen kod). Det här paketet visar
den enda biten som behöver riktig kod: ett **Förädlings**-steg, och
kontraktet alla steg — oavsett typ — skulle behöva följa.

## Kör det

```bash
npm install
npm test
```

Kör `tsc` (typkontroll + kompilering) och sedan Node:s inbyggda testrunner
mot resultatet. Fyra tester, ingen extern testramverk krävs.

## Vad som finns här

- **`src/types.ts`** — själva kontraktet: `Step<TIn, TOut>`, `StepContext`
  (beroenden skickas in, inget hämtas globalt), `StepMeta` (namn +
  version), och `OrderIM` — samma kanoniska modell som mappningsmotorn
  använder.
- **`src/steps/foradling.frakt-kalkyl.ts`** (v1.0.0) och
  **`foradling.frakt-kalkyl.v2.ts`** (v2.1.0) — två versioner av samma
  steg, olika prislogik, identiskt kontrakt. En kunds pipeline pekar på en
  specifik version; att byta version för en kund rör aldrig de andra.
- **`src/steps/foradling.frakt-kalkyl.test.ts`** — visar mönstret för
  `icore test`: en falsk `StepContext`, ett exempelmeddelande, ett facit.
  Körs helt offline, ingen databas eller riktig pipeline behövs.

## Kopplingen till pipeline-vyn i POC:n

Siffrorna i testet (214 kr för v1, 198 kr för v2, samma exempelorder) är
inte påhittade separat — de är samma siffror som visas i
"Testa v2.1.0 mot samma exempel"-jämförelsen i `mapping-engine.html`
under fliken **Pipeline (steg)**. Mockupen visar hur det skulle se ut i
portalen; den här koden visar vad som faktiskt skulle köra bakom den.
