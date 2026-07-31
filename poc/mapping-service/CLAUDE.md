# Mappningstjänsten — CLAUDE.md

Det här är den generiska, delade Azure-runtimen som kör iCores mapp­nings-,
förädlings- och API-klient-steg. Om du är en LLM som pekats hit för att
bygga eller ändra en mappning: läs hela den här filen innan du gör något.
Om du är en människa som är ny i repot: samma sak, den gäller dig också.

En mappning byggd idag av en person och en byggd om två veckor av en
kollega — eller en annan LLM — ska följa exakt samma mönster. Den här
filen är sanningen, inte den senaste chatt-konversationen.

---

## Vad tjänsten gör

Ett enda, generiskt API-anrop kör vilket steg som helst — mappning,
förädling eller ett API-klient-anrop mot ett kundsystem. Tjänsten känner
inte till hela integrationskedjan, bara sitt eget steg. iCore orkestrerar,
loggar och håller ihop helheten; den här tjänsten kör ett steg i taget när
den blir ombedd.

```
POST /api/steg/{kund}/{stegnamn}/{version}
Headers: Authorization (nyckel/identitet skopad till just {kund})
         X-Correlation-Id (knyter ihop hela ordern genom alla steg i loggen)
Body:    payload

→ 200 OK + mappad fil            (mappning/förädling — synkront, alltid)
→ 202 Accepted + Correlation-Id  (API-klient mot ett kundsystem — async,
                                   completion-event triggas separat)
```

Kund + stegnamn + version + payload + korrelations-id är all information
tjänsten någonsin behöver för att veta vad som ska köras.

---

## Så lägger du till eller ändrar en mappning (det vanligaste jobbet)

1. **Ren fältmappning** → skapa/ändra `steps/{kund}/{stegnamn}.json`, ett
   deklarativt schema (källfält → målfält → transform). Inga if-satser,
   ingen logik — bara data. Se `steps/_template/mapping.example.json`.
2. **Förädling eller API-klient (kräver riktig logik)** → skapa/ändra
   `steps/{kund}/{stegnamn}.ts` som implementerar kontraktet i
   `platform/contract/types.ts` (`Step<TIn, TOut>`, `StepContext`). Skriv
   inte om kontraktet — bara steget.
3. Skriv ett test bredvid steget, mot exempeldata. Se
   `steps/_template/` för mönstret — samma sorts test som redan finns i
   `icore-step-contract` (in-data, facit, ingen extern uppkoppling).
4. Kör `npm test`. Måste vara grönt innan en PR öppnas.
5. Öppna en PR som **bara** rör filer under `steps/{kund}/`. Om du tror
   du behöver ändra något under `platform/` — stanna och fråga en
   människa istället för att anta att det är okej.
6. En människa granskar och mergar. Pipelinen bygger och driftsätter
   automatiskt efter merge — ingen manuell kopiering.
7. En ny version aktiveras för en kund genom att peka om **en rad** i
   iCores dispatch-konfiguration, inte genom att skriva över den gamla
   versionen. Gamla versioner ligger kvar och går att rulla tillbaka till.

---

## Loggning — gör så här, uppfinn inget nytt

Varje steg MÅSTE logga strukturerat till Application Insights med minst:

```ts
context.log({ correlationId, kund, steg, version, status, durationMs });
```

`X-Correlation-Id` från anropet ska alltid följa med — det är det enda
som låter Mappningsportalen och iCores egen logg visa hela ordern som en
sammanhängande kedja istället för fem lösryckta rader. Hittar du inte ett
korrelations-id i kontexten: fråga, hitta inte på ett nytt loggformat.

---

## Rättigheter — minsta möjliga, alltid

Varje kund har sin egen nyckel/identitet i Key Vault, skopad till bara
den kundens mappningar. Ett steg för `Kund A` ska aldrig kunna läsa eller
skriva `Kund B`:s data eller hemligheter.

- Lägg **aldrig** till en bredare rättighet än vad det steg du bygger
  faktiskt behöver.
- Om ett steg verkar behöva tillgång till något utanför sin egen kunds
  scope — stanna och fråga. Anta inte att det är okej att bredda access
  för att det är bekvämt.
- Nya hemligheter (API-nycklar mot kundsystem etc.) läggs i Key Vault,
  aldrig i kod, aldrig i en PR.

---

## Vad du INTE ska ändra utan att fråga en människa först

- `platform/` — dispatcher, routing, auth, loggningsinfrastruktur. Det
  här är plattformens kärna och delas av alla kunder. En bugg här slår
  mot alla, inte en.
- Infrastrukturkoden (`infra/*.bicep`) eller CI/CD-pipelinen. Nya
  Azure-resurser är ett infrastrukturbeslut, inte något som följer med
  en mappnings-PR.
- Att aktivera en ny version i produktion. Det sista klicket görs alltid
  av en människa, oavsett vem — eller vad — som skrev koden.
- Nya npm/NuGet-beroenden utan tydlig anledning. Fråga hellre en gång
  för mycket än att dra in ett paket ingen bett om.

---

## Exempel att utgå från

- `steps/nordic-lager-ab/business-central-in.json` — enkel fältmappning,
  synkront svar.
- `steps/baltic-freight/fraktkalkyl.ts` — förädling med riktig
  beräkningslogik, två versioner sida vid sida (`v1.0.0` och `v2.1.0`).
- `steps/baltic-freight/astro-out.ts` — API-klient mot ett kundsystem,
  asynkront, med retries. Se `platform/dotnet-client-template/` för
  mönstret om steget behöver vara .NET istället för TypeScript.

Om du är osäker på vilket av de tre mönstren en ny uppgift följer: fråga
hellre än att gissa. Fel mönster här är dyrare att reda ut i efterhand än
att ställa frågan innan du börjar skriva.
