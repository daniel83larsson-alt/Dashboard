# iCore + Azure — sammanfattning för ny session

## Grundproblemet

iCore har ett eget, gammalt men fungerande låg-kod-verktyg för att bygga integrationsskript. Problemet: en LLM kan inte jobba i det — det är osynligt för AI-assisterad utveckling. Lösningen är **inte** att bygga om iCore. Det är att byta ut *författarverktyget* och behålla *körmotorn* (orkestrering, loggning, dispatch) som den är.

## Grundprincipen: minsta möjliga ändring i iCore

iCore fortsätter äga orkestrering, loggning och beslutet om vilken version som körs för vilken kund. Allt som behöver kunna ändras, synas och byggas av en LLM flyttar till Azure — som fristående, versionerade steg. iCores kärna rörs knappt.

## Pipeline-modellen

Varje integration bryts i fristående, event-triggade steg: **Inbound → Mappning → Förädling → Mappning → Outbound**. Varje steg triggar nästa via ett event. Löskopplat — ett steg kan bytas/testas/driftsättas utan att röra de andra.

## Var varje typ av steg kör, och varför

- **Connectors som redan fungerar** (t.ex. filhämtning) — rörs inte, stannar i iCore.
- **Mappningar** (fält A → fält B) — Azure, LLM-genererade, **synkrona**: iCore skickar payload, svaret *är* den mappade filen direkt. Ingen mellanlagring, iCore äger filen hela tiden.
- **Förädling** (riktig affärslogik — beräkningar, regler, masterdata) — egen .NET Web API, men **hostad av iCore själv**, inte Azure — eftersom den behöver direkt åtkomst till iCores interna funktioner, inte bara data via ett generiskt API.
- **API-klient mot ett externt system** (t.ex. ett kundsystem/WMS) — Azure, .NET, **asynkront** (202 Accepted direkt, ett separat completion-event senare) — inte för att arkitekturen kräver det, utan för att mottagaren är ett tredjepartssystem med egen, opålitlig svarstid.

## Det generiska API-kontraktet

```
POST /api/steg/{kund}/{stegnamn}/{version}
Headers: Authorization (nyckel per kund), X-Correlation-Id
Body:    payload
→ 200 OK + mappad fil            (synkront: mappning/förädling)
→ 202 Accepted + Correlation-Id  (async: API-klient, completion-event kommer separat)
```

Kund + stegnamn + version + payload + korrelations-id är allt tjänsten någonsin behöver veta. En generisk yta, inte genererade API:er per mappning.

## De minimala öppningarna som faktiskt krävs i iCore

Mindre än man tror: mappningarna behöver **ingen** ny iCore-API alls (de är synkrona — iCore skickar och får svar direkt). Det enda som krävs:
1. Ett nytt alternativ i dispatch-tabellen: "kör extern URL" som alternativ till "kör internt skript" (matchningslogiken i sig rörs inte).
2. En "trigga event"-API i iCore, bara för att det asynkrona API-klient-steget ska kunna signalera "klart" när det externa systemet väl svarat.

## Mappningarnas format

Deklarativt JSON-schema (`from`/`to`/`transform`) — inte fritt kodad logik. Säkrare för en LLM att ändra (kan bara flytta fält, inte skriva godtycklig kod), och går att visualisera direkt utan att tolka kod. Riktig kod (TypeScript/.NET) bara där verklig logik krävs: förädling och API-klienter.

## Miljöer och driftsättning

- **Dev → UAT → Prod** som deployment slots i samma Azure Function App — samma byggda kod flyttas mellan lägena, byggs aldrig om på vägen. API Management framför UAT och Prod (samma gateway/policyer). Dev testas direkt mot funktions-URL:en, manuellt och med agenter.
- iCores dispatch-tabell pekar **bara** mot Prod — Dev/UAT nås aldrig av en riktig order.
- **Mappnings-JSON separeras från stegkoden**: git är sanningen för versionshistorik, men publiceras via en egen, snabbare pipeline till en körtidskälla (Blob Storage/App Configuration) som Function-koden faktiskt läser. En ändrad mappning kräver inte en ny kodversion.
- **Lasttest**: Azure Load Testing, alltid mot UAT — en agent genererar varierade testpayloads från de faktiska mappnings-scheman, en annan agent tolkar resultatet och flaggar regressioner.

## Två portaler, olika jobb

- **Felsökningsportal** (läs) — mappningsöversikt, sök på ordernummer/korrelations-id för att se en specifik orders resa, dashboard. Läser Application Insights + iCore + konfigurationskällan.
- **Scenario-portal** (skriv) — skapa/ändra mappningar, drag-and-drop för sista-steget-justeringar (samma JSON-data, bara ett vänligare gränssnitt), aktivera en ny version för en kund (mänskligt godkännande-klick).

## Azure-tjänster som faktiskt behövs

Functions (stegkörningen), Key Vault (hemligheter per kund), Application Insights (loggning), Blob Storage/App Configuration (mappningarnas körtidskälla + claim-check för async-steget), API Management (framdörr för UAT/Prod), Azure Load Testing, GitHub Actions med OIDC (driftsättning, ingen lagrad hemlighet). Medvetet bortvalt: Logic Apps (samma låg-kod-fälla som gamla iCore-developern), Service Bus/Event Grid (inte nödvändigt vid nuvarande volym).

## Konkret pilotexempel som redan är genomtänkt

FTP-order → mappa till IM-format → förädla i iCore → mappa till utformat → API-anrop till "Astro" (ett WMS-system). Fem separata steg, var sitt event. Ett riktigt, testat kodexempel finns redan (`icore-step-contract`): ett förädlingssteg (fraktkalkyl) i två versioner, fyra passerande tester.

## Arbetssätt för ändringar (människa eller LLM, samma regler)

Gren → automatiska tester → mänsklig granskning → automatisk driftsättning → en dispatch-rad flippas per kund. En människa godkänner alltid innan en ny version aktiveras i produktion, oavsett vem eller vad som skrev koden.

## Vad som INTE är gjort än

Inget är driftsatt på riktigt — allt hittills är kod, arkitektur och klickbara mockups, inte en levande Azure-miljö. Ingen bekräftad koppling till iCores riktiga API:er eller data. Öppen fråga: finns en CSM/iCoreNova-koppling som skulle ge tillgång till riktig iCore-data (inte bekräftad).
