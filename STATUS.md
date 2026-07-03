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

## Hemkoll (ny app)

- ✅ App scaffolded, delar auth med DL Trainer, egna `hemkoll_*`-tabeller, RLS.
- ✅ Databasschema körts och verifierat (var initialt ett missförstått "Success" — kollade direkt mot databasen istället för att lita på minnet).
- ✅ Rådgivaren (chatt) kopplad till elpris (elprisetjustnu.se, gratis, ingen nyckel) — antagande om elzon SE3 är synligt i svaret, inte dolt.
- ✅ Bytt från Anthropic-nyckel till Gemini-nyckel (gratis) enligt instruktion.
- 🔄 Import breddad till Länk / Dokument / Fritext (var bara länk innan). Kod klar, typecheck + build gick igenom rent, men inte livetestad med riktig nyckel än (se not nedan) — testa gärna live och säg till.
- 🔄 Fixat bugg: import skrev tidigare rätt över befintlig husdata (även med tomma fält). Nu: förhandsgranskning där du väljer vilka fält som ska sparas, inget sparas automatiskt. Samma verifieringsstatus som ovan.
- 🔄 "Sök mer info om huset" — AI-sökning (Google-grunding via Gemini, gratis upp till 1500 sökningar/dag) efter taxeringsvärde, tomtarea, kommun m.m. Visas som förslag, sparas bara om du väljer det. Samma verifieringsstatus som ovan.
- 🔄 Karta över husets läge på Översikt (gratis OpenStreetMap, ingen nyckel) — dyker upp automatiskt när en adress är sparad. Samma verifieringsstatus som ovan.
- ✅ Desktop-skiss levererad som interaktiv mockup (Artifact), v2 efter feedback: ljusare tema, flera uppvärmningssystem visas, missvisande "mätare" för boyta/ålder borttagna, åäö-buggen (saknad charset) fixad.
- 🧊 SMHI-väderdata i rådgivaren — nedprioriterat efter beslut 2026-07-03. Daniel: inte intressant som "dagens väder", men kan bli relevant senare som historisk väderdata matchad mot elförbrukning. Vilar tills vidare.
- ⏳ Stöd för flera uppvärmningssystem i verkliga appen (idag bara ett textfält `heating_type`) — bekräftat i skissen, inte byggt i produktionskoden än.
- 🔄 **Homey-koppling — prioriterad, näst på tur.** Utredd: Homey har ett rent OAuth2 Web API (api.developer.homey.app), fungerar bra för alla användare eftersom Homey är molnbaserat. Daniel äger själv en Homey, så vi kan testa live. Väntar på svar om omfattning (bara läsa data, eller även styra enheter) innan bygget startar.
- 🧊 Home Assistant-koppling — utredd men inte prioriterad: kräver antingen att användarens HA-instans är nåbar utifrån (t.ex. via Nabu Casa) plus en manuellt inklistrad åtkomsttoken, eller går det inte alls om HA bara körs lokalt hemma.
- 🔄 **Besiktningsprotokoll → att-göra-lista — prioriterad, näst på tur.** Bygger vidare på dokumentimporten som redan finns: läser protokollet och strukturerar det till en avbockningsbar lista med allvarlighetsgrad, istället för bara husfält.
- ⏳ Besiktningsprotokoll → automatisk att-göra-lista — inte påbörjat, behöver avgränsas (Noa: vad är "klar" här, binärt?) innan det byggs.
- ⏳ Projekt med budget + tips från flera agenter — inte påbörjat, samma sak: behöver avgränsas till ett konkret, verifierbart mål innan bygge.
- 🧊 Fastighetsregister/energideklaration via Boverket/Lantmäteriet — kräver BankID-signerat avtal/konto, inte en snabb integration. Väntar på beslut om det är värt att göra just nu.

## Process

- ✅ Den här filen — statuslista så du kan se vad som är klart/pågår/inte påbörjat, och stämma av innan något kallas klart.

**Öppen fråga just nu:** Vercel-CLI:ns inloggning i den här sessionen gick ut och kräver en webbläsarbekräftelse för att förnyas, vilket jag inte kan göra åt dig. Det betyder att koden ovan (import/sök/karta) är pushad, typad och byggd utan fel — men inte livetestad med riktig AI-nyckel den här gången, och jag har inte kunnat bekräfta att Vercel faktiskt deployat den. Testa gärna på hemkoll-phi.vercel.app om en liten stund och säg till om något strular.

---

**Regel framåt:** varje nytt önskemål från Daniel läggs till här innan arbetet börjar. Inget markeras ✅ förrän det faktiskt är verifierat (kört, testat eller kontrollerat mot systemet) — inte bara "borde fungera".
