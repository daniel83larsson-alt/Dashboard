---
name: recap-prompt-change
description: Lägga till eller ändra innehåll i veckorecap, månadsrapport, kort eller mejl (inkl. AI-promptar) i DL Trainer.
---

# Ändra recap/rapport

Filer: `lib/weekly-digest-generate.ts`, `lib/monthly-report-generate.ts` (+ `weekly-digest.ts`, `monthly-report.ts`), kort `components/WeeklyDigestCard.tsx`, mejl `lib/weekly-digest-email.ts` / `monthly-report-email.ts`. Delade block: `lib/effort-summary.ts`, `lib/effort-email.ts`, `components/EffortBlock.tsx`.

Regler:
- Beräkningar ligger i rena funktioner (ingen I/O) med enhetstester; hämtning separat och smal (JSON-path, inte hela `raw_data`).
- Nytt fält i sparad post är **valfritt** (`?`) — äldre sparade recaps saknar det och måste fortfarande visas.
- Ett AI-fält läggs till i schema + `required` **bara** när underlag finns; tvinga annars `null` efter svaret.
- Prompten ska kräva en konkret siffra och förbjuda påhittade siffror. Beskriv, döm inte, om Daniel inte bett om en bedömning.
- Källa och täckning visas ärligt: "baserat på X av Y pass", "uppskattad" vs Garmin.
- "Missad loggdag" definieras bara av `countableDays` (lib/deficit.ts) — räkna aldrig `av 7` hårt.
- Rekord definieras bara av `newRecordsForLatest` (lib/records.ts, 1 %-marginal).
- Månadsrapporten är idempotent per månad och skickas i batchar; testa utan att skicka mejl till riktiga användare.
- Daniel ser resultatet genom att trycka "Uppdatera" på Veckans Recap — markera ✅ först när han sett det.
