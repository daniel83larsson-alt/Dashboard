---
name: live-check
description: Verifiera mot den levande resursen (databas, cron, miljövariabel, Vercel-gren) innan något markeras ✅. Använd när en ändring beror på något utanför koden.
---

# Kontrollera mot det levande systemet

Bakgrund (Retro 2026-09-20): en migrering som aldrig kördes i prod och ett cron-schema på fel gren klarade hela testsviten men gjorde ingenting i över en vecka.

Projekt: Supabase `gjvcagmfmanqbvoxjtoi`, Vercel `prj_YJiejsLj4L3BdEcMm6xOEQGj9RRd`, repo `daniel83larsson-alt/Dashboard`.

| Beror på | Kontrollera så här |
|---|---|
| Migrering / schema / policy | `execute_sql` mot prod: finns kolumnen/funktionen/policyn? Testa effekten, inte bara att den finns. |
| Beräkning på riktig data | Kopiera riktiga rader via Supabase MCP till ett tillfälligt test + SQL-kontrollsumma, kör, **radera testet**. |
| pg_cron-jobb | `cron.job` (aktiv, schema) + `cron.job_run_details` (kördes på minuten, status succeeded, HTTP 200). |
| GitHub-schema | Läs workflow-filen på **huvudgrenen** (`get_file_contents` utan `ref`) — schedule körs bara därifrån, och kan komma timmar sent. |
| Miljövariabel | Vercel: vilka miljöer gäller den? dltrainer.se och dl-trainer.vercel.app ligger på dev-grenens deployments (target null), "production"-only når dem inte. |
| Domän/deploy | `list_deployments` + `list_deployment_aliases`: pekar dltrainer.se på rätt bygge? Obs: varje commit till huvudgrenen startar ett Vercel-produktionsbygge, `[skip ci]` hjälper inte. |
| Skärmutseende | Playwright med `executablePath: '/opt/pw-browsers/chromium'` mot temporär preview-route; radera route + `rm -rf .next` efteråt. |

Rapportera vad som verifierats och **hur** (se STATUS.md-skalan). Kunde något inte kontrolleras: säg det, markera inte ✅.
