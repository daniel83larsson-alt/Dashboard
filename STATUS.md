# Statuslista — Daniels frågor & önskemål

Ägs av Alex. Uppdateras varje gång Daniel skickar ett nytt önskemål eller en fråga.
Stäms av mot INNAN något rapporteras som "klart" till Daniel — se regel i CLAUDE.md.

Status: ✅ Klart · 🔄 Pågår · ⏳ Ej påbörjad · 🧊 Pausad/väntar på beslut

---

## DL Trainer

- ✅ Jessika (ny användare) fick data som inte var hennes — spårat till Next.js router-cache/cookie-problem (inte RLS), fixat med hård navigation vid login/logout, verifierat.
- ✅ Dubbla pass för Concept2 + Garmin — byggt ihopslagnings-logik istället för att pausa Concept2 (fanns instruktion: "Synka ihop det"). Fixat två äldre mekanismer som motverkade det (sync-garmin-filter, auto-cleanup).
- ✅ Fråga: "Kan fler regga sig?" — besvarad (ja, öppen signup, inga spärrar satta).
- ✅ Fråga: drar svar på engelska färre tokens än svenska? — besvarad.
- 🔄 **Antal pass + dagar synkade per användare i admin.** Kod klar, byggd, pushad och deployad (verifierat live på dl-trainer.vercel.app). Visar t.ex. "42 pass · 18 dagar · senast synkat igår", eller "Anslutet men inget synkat än" / "Inget synkat ännu". Väntar på att SQL-funktionen körs i Supabase (se nedan) innan siffrorna syns.

## Hemkoll (ny app)

- ✅ App scaffolded, delar auth med DL Trainer, egna `hemkoll_*`-tabeller, RLS.
- ✅ Databasschema körts och verifierat (var initialt ett missförstått "Success" — kollade direkt mot databasen istället för att lita på minnet).
- ✅ Rådgivaren (chatt) kopplad till elpris (elprisetjustnu.se, gratis, ingen nyckel) — antagande om elzon SE3 är synligt i svaret, inte dolt.
- ✅ Bytt från Anthropic-nyckel till Gemini-nyckel (gratis) enligt instruktion.
- ✅ Import breddad till Länk / Dokument / Fritext (var bara länk innan). Livetestad mot skarp produktion med riktig AI-nyckel: fritext, dokument (bild) och länk gav alla korrekt utstrukturerad data.
- ✅ Fixat bugg: import skrev tidigare rätt över befintlig husdata (även med tomma fält). Nu: förhandsgranskning där du väljer vilka fält som ska sparas, inget sparas automatiskt.
- ✅ "Sök mer info om huset" — AI-sökning (Google-grunding via Gemini, gratis upp till 1500 sökningar/dag) efter taxeringsvärde, tomtarea, kommun m.m. Livetestad: hittade rätt kommun, redovisade ärligt att inget säljpris hittades för just den adressen (gissade inte), 17 riktiga källänkor. Visas som förslag, sparas bara om du väljer det.
- ✅ Karta över husets läge på Översikt (gratis OpenStreetMap, ingen nyckel) — dyker upp automatiskt när en adress är sparad. Geokodning livetestad och verifierad (rätt koordinater för en riktig adress).
- ✅ Desktop-skiss levererad som interaktiv mockup (Artifact), v2 efter feedback: ljusare tema, flera uppvärmningssystem visas, missvisande "mätare" för boyta/ålder borttagna, åäö-buggen (saknad charset) fixad.
- 🧊 SMHI-väderdata i rådgivaren — nedprioriterat efter beslut 2026-07-03. Daniel: inte intressant som "dagens väder", men kan bli relevant senare som historisk väderdata matchad mot elförbrukning. Vilar tills vidare.
- ⏳ Stöd för flera uppvärmningssystem i verkliga appen (idag bara ett textfält `heating_type`) — bekräftat i skissen, inte byggt i produktionskoden än.
- 🔄 **Homey-koppling — kod klar, första anslutningsförsöket gick inte igenom.** Bara läsa (inte styra), byggd mot Athoms officiella `homey-api`-SDK (verifierat mot källkoden). Daniel klickade Anslut och godkände på Homey, men kortet visade fortsatt "Anslut Homey" efteråt — och det gick inte att se varför, eftersom ett misslyckat callback-steg omdirigerade tillbaka utan att visa något felmeddelande. Fixat: dashboarden visar nu tydligt om anslutningen lyckades eller varför den inte gjorde det, och varje felväg loggas. Redo att testa om.
- ⏳ Import breddad rejält efter Daniels Onsala-hus-exempel: fångar nu köppris/köpår, källararea, ALLA uppvärmningssystem var för sig (inte bara ett), smart hem-plattform, solceller, elbilsladdning, renoveringshistorik och pågående projekt med budget. Kod klar, byggd, pushad — väntar på att den nya databasfilen körs (se nedan) innan det går att spara de nya fälten. Extraktionskvaliteten kunde inte slutverifieras än — Gemini-gratiskvoten (20 anrop/minut) tog slut mitt under testandet.
- 🧊 Home Assistant-koppling — utredd men inte prioriterad: kräver antingen att användarens HA-instans är nåbar utifrån (t.ex. via Nabu Casa) plus en manuellt inklistrad åtkomsttoken, eller går det inte alls om HA bara körs lokalt hemma.
- ⏳ **Besiktningsprotokoll → att-göra-lista — prioriterad, näst på tur.** Bygger vidare på dokumentimporten som redan finns (och är nu bevisat fungerande efter livetestet ovan): läser protokollet och strukturerar det till en avbockningsbar lista med allvarlighetsgrad, istället för bara husfält.
- ⏳ Projekt med budget + tips från flera agenter — inte påbörjat, behöver avgränsas till ett konkret, verifierbart mål innan bygge.
- 🧊 Fastighetsregister/energideklaration via Boverket/Lantmäteriet — kräver BankID-signerat avtal/konto, inte en snabb integration. Väntar på beslut om det är värt att göra just nu.

## Process

- ✅ Den här filen — statuslista så du kan se vad som är klart/pågår/inte påbörjat, och stämma av innan något kallas klart.

**Löst:** Vercel-inloggningen som saknades tidigare är löst — Daniel skapade en tidsbegränsad åtkomsttoken (30 dagar, återkallningsbar när som helst från Vercels dashboard). Import, sök och karta är nu livetestade mot skarp produktion med riktig nyckel (raderna ovan uppdaterade från 🔄 till ✅). Testdata som skapades under testet är borttagen igen.

**SQL som väntar på att köras:**
1. Hemkoll — uppdaterad `hemkoll/supabase/schema.sql` (nya kolumner + Homey-tabell, säker att köra om i sin helhet).
2. DL Trainer — ny funktion `admin_activity_stats()` i `app/supabase/schema.sql`, kan köras isolerat (bara det nya blocket, `create or replace function` är alltid säkert att köra om).

---

**Regel framåt:** varje nytt önskemål från Daniel läggs till här innan arbetet börjar. Inget markeras ✅ förrän det faktiskt är verifierat (kört, testat eller kontrollerat mot systemet) — inte bara "borde fungera".
