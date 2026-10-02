---
name: schedule-change
description: Ändra eller lägga till schemalagda jobb (cron-routes, pg_cron, GitHub Actions) i DL Trainer utan att det tyst slutar fungera eller dubblas.
---

# Ändra schemalagda jobb

Två schemaläggare finns — välj medvetet och dokumentera i STATUS.md:
- **Supabase pg_cron** (exakt tid): 9 enkla GET-jobb mot `/api/cron/*` via `public.call_scheduled_cron_route(route, query)` + Vault-hemligheten `scheduler_secret`. Pausa/starta med `cron.alter_job(job_id, active := …)` (direkt UPDATE på cron.job nekas).
- **GitHub Actions** (`.github/workflows/dl-trainer-cron.yml`): sync-all, weekly-digest, monthly-report (batchas, tar tid). Körs **bara från huvudgrenens kopia** av filen och kan vara timmar sena.

Checklista:
1. Cron-route accepterar `CRON_SECRET` (GH) eller `SCHEDULER_SECRET` (pg_cron); `route-invariants.test.ts` kräver texten `CRON_SECRET` i varje cron-route.
2. Flyttar du ett jobb mellan schemaläggare: ta bort det från den gamla **samtidigt**, annars dubblerade påminnelser.
3. Ändrar du workflow-filen: committa den på huvudgrenen (kräver Daniels uttryckliga OK att röra annan gren) och verifiera att båda grenarnas fil är identisk (blob-sha).
4. Verifiera med skillen `live-check`: faktisk körning på rätt minut, status, och effekt i databasen. Ett jobb som aldrig haft sin dag (t.ex. söndagsjobb) markeras ⏳ med datum för kontroll.
