# Kopplingsregister (vad teamet når och får göra)

Ägare för allt: Daniel. Uppdateras av Jordan när en koppling läggs till/tas bort. **Personuppgifter** = rör hälsodata (sömn, puls, vikt, mat) eller kontaktuppgifter.

| Koppling | Används till | Nivå | Kräver Daniels OK | Personuppgifter |
|---|---|---|---|---|
| **Supabase** (projekt `gjvcagmfmanqbvoxjtoi`) | Läsa/skriva prod-databas, migreringar, pg_cron, Vault | Full (SQL, migrering) | Radering av data, ändring som påverkar andra användares rader, nya hemligheter | **Ja** — alla användares hälsodata. Läs minsta möjliga; kopiera aldrig rader utanför temporära tester som raderas. |
| **Vercel** (`prj_YJiejsLj4L3BdEcMm6xOEQGj9RRd`) | Deploy-status, domäner/alias, miljövariabler, loggar | Läs + konfig | Ändra domän/alias, miljövariabler, rollback/promote | Loggar kan innehålla användardata |
| **GitHub** (`daniel83larsson-alt/Dashboard`) | Kod, grenar, workflow-filer | Skriv på arbetsgrenen `claude/daniels-healthkit-dashboard-7d274i` | **Allt på annan gren**, inkl. huvudgrenen `claude/dev-team-structure-c6s163` (varje commit där startar ett Vercel-produktionsbygge) | Nej |
| **DL Trainer MCP** (`mcp__Dltrainer__*`) | Daniels egen data till Claude-chattar | Läs | — | **Ja** (Daniels egen) |
| **Gmail** | Mejl (läs/skicka) | Läs/utkast | Skicka mejl, radera | **Ja** |
| **Sentry** | Felrapporter | Kräver inloggning (ej auktoriserad i sessioner) | — | Kan innehålla användar-id |
| **Gemini API** (via appen) | AI-texter i recap/coach | Server-nyckel i Vercel | Byte av nyckel/modell | Skickar träningsdata till tredje part |
| **Garmin / Concept2 / YAZIO** (via appen) | Synk av användares data | Användarens egna uppgifter, krypterade | — | **Ja** |

Öppna punkter: `notify_new_signup` har en hårdkodad webhook-hemlighet (Sam: teknisk skuld, ej åtgärdad).
