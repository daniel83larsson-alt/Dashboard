---
name: verify-change
description: Kör hela verifieringskedjan för DL Trainer (app/) innan något rapporteras som klart — typkontroll, lint, tester, produktionsbygge. Använd efter varje kodändring i app/.
---

# Verifiera en ändring (DL Trainer)

Kör i `app/`, **ett kommando per Bash-anrop** (blandas de kan en klassificerare avvisa hela anropet):

1. `npx tsc --noEmit` — måste vara helt tyst.
2. `npm run lint` — 0 fel. En känd varning finns (`<img>` i `FoodLogClient.tsx`); nya varningar är inte OK.
3. `npx vitest run` — alla gröna. Vitest döljer console-utdata: skriv till en fil i scratchpad om du behöver se den.
4. Bygge med platshållar-miljö:
   `NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key NEXT_PUBLIC_VAPID_PUBLIC_KEY=BKI8cVnI9T6XcAUFsmWI7a94LCHDAosdn3i9s2vqIVS2cLsYgBuwuIYjdEnzrV6UHgn3XWxfX72eUIqdkqtxrwA npm run build`
5. Har en temporär preview-route (`zz-…`) eller `.next/dev` använts: radera den och `rm -rf .next` i ett eget anrop (annars ger gamla typer falska tsc-fel).

Regler:
- Nya/ändrade beteenden får egna enhetstester, gränsvärden testas precis under/vid/över.
- Hittar du en bugg: sök igenom hela kodbasen efter samma mönster, inte bara platsen du hittade den.
- Gröna tester ≠ live. Allt som beror på något utanför koden (migrering, cron, miljövariabel, gren) kontrolleras med skillen `live-check`.
- Commit/push bara till arbetsgrenen, aldrig huvudgrenen utan Daniels uttryckliga OK.
