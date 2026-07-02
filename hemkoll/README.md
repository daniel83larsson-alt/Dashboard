# Hemkoll

Loggbok + inventering för huset, med AI-rådgivare som svarar utifrån vad som faktiskt är loggat (inte generiska tips).

- **Objekt & logg** — vad finns i huset, och när blev det senast åtgärdat
- **Importera** — klistra in en länk till ett mäklarprospekt/bostadsannons, en agent extraherar byggår, boyta, uppvärmning m.m.
- **Rådgivare** — chatt grundad i husprofilen + loggade händelser

## Status

Pilotprojekt för "loop engineering" — se `CLAUDE.md` i repo-roten (Noa, Loop-arkitekt) för processen som byggde det här. Delar Supabase-auth med DL Trainer (`/app`) men egna, RLS-isolerade tabeller (`hemkoll_*`) — se `supabase/schema.sql`, kör den i Supabase SQL Editor innan första körning.

## Utveckling

```bash
cp .env.local.example .env.local   # fyll i Supabase-URL/nyckel (samma som DL Trainer) + ANTHROPIC_API_KEY
npm install
npm run dev
```

Denna Next.js-version har samma anpassningar som `/app` (se `AGENTS.md`) — `proxy.ts` istället för `middleware.ts`, `params`/`searchParams` som `Promise<{...}>`.
