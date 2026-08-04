# CONTEXT.md — iCore × Azure-integrationsarbetet

Delat språk för allt som rör att flytta iCores mappnings-, förädlings-
och API-klient-steg till Azure, och göra dem synliga/redigerbara med
hjälp av en LLM. Gäller filerna i den här mappen som rör iCore/Azure
(`mapping-engine.html`, `container-pitch.html`, `icore-step-contract/`,
`icore-azure-blueprint.html`, `icore-azure-case-astro.html`,
`icore-azure-sequence-diagram.md`, `mapping-portal-mock.html`,
`mapping-service/`, samt de ursprungliga mockuparna `index.html`,
`ideas.html`, `pitch.html`). Gäller **inte** Världens Husmanskost —
den har sin egen `husmanskost-varlden-CONTEXT.md`.

## Kärnbegrepp

- **Gamla developern** — iCores befintliga, egenutvecklade låg-kod-verktyg för att bygga integrationsskript. Fungerar, men är osynligt för en LLM — det är grundproblemet hela det här arbetet kringgår genom att byta ut författarverktyget, inte genom att laga det gamla.
- **Claim check** — eventet bär en pekare till filen (filnamn/plats), aldrig filen själv. Mönstret iCore redan använder idag och som Azure-stegen återanvänder.
- **IM-format** — det kanoniska mellanformatet (Intermediate Message) alla mappningar går via. Källa → IM → Mål, aldrig direkt Källa → Mål.
- **Mappning** — ren fält-till-fält-transformation utan affärslogik. Uttrycks deklarativt (ett litet JSON-schema: `from`/`to`/`transform`), inte som handskriven kod.
- **Förädling** — steget med riktig affärslogik: beräkningar, regler, masterdata-uppslag. Skiljs medvetet från mappning. Körs som en egen .NET Web API **hostad av iCore själv**, inte i Azure — eftersom det är där produktens befintliga regler och sättningar redan finns, och att bygga om dem i Azure hade varit dubbelarbete.
- **Steg (Step)** — den minsta oberoende, versionerade enheten i en integration. Ett helt flöde bryts i fem: Inbound → Mappning → Förädling → Mappning → Outbound. Kontraktet: `Step<TIn, TOut>` + `StepContext` (beroenden skickas in, inget hämtas globalt) — se `icore-step-contract/src/types.ts`.
- **Dispatch(-tabell)** — iCores befintliga uppslag: event + partner + filtyp → vilket skript som körs. Den minsta ändring som krävs är att lägga till ett nytt möjligt svar — "kör extern URL" — som alternativ till "kör internt skript". Matchningslogiken i sig rörs inte.
- **Synkront steg** — mappning eller förädling: iCore skickar payload, får den mappade filen tillbaka i samma svar. Ingen mellanlagring, iCore äger filen hela tiden.
- **Asynkront steg** — ett API-anrop mot ett externt system (t.ex. Astro): svarar 202 Accepted direkt, ett separat completion-event kommer när det externa systemet faktiskt bekräftat.
- **Correlation-Id** — följer en order genom alla steg i loggen, så hela kedjan syns som en sammanhängande historia i portalen istället för lösryckta rader per steg.
- **Mappningsportalen** — den visuella list+detalj-vyn över alla mappningar: sökbar, filtrerbar (kund/status/typ), med **Fältvy** (redigerbar tabell) och **Kod/DSL-vy** (JSON-spec, LLM-redigerbar). Mockup: `mapping-portal-mock.html`.
- **Astro (WMS)** — det konkreta exempelcaset (kund Baltic Freight, ett lager-/WMS-system) som används genomgående för att hålla arkitekturen konkret istället för abstrakt.
- **Azure Integration Services** — Microsofts namngivna tjänstepaket (Functions, API Management, Logic Apps, Service Bus, Event Grid, Integration Account m.fl.). Verktygslådan för själva stegkörningen — iCore behåller orkestrering, loggning och dispatch oavsett vilka av dem som används. Se `icore-azure-blueprint.html` för vilka som faktiskt valts respektive medvetet valts bort.

## Format- och notationsskillnad värd att komma ihåg

- **Arkitekturdiagram** visar *var* något körs (`icore-azure-case-astro.html`).
- **Sekvensdiagram** visar *ordning* och *vem som väntar på vem* (`icore-azure-sequence-diagram.md`) — rätt verktyg när frågan är "vad hanteras var, i vilken ordning", inte bara "vilka bitar finns".
