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
- ✅ Import breddad till Länk / Dokument / Fritext (var bara länk innan).
- ✅ Fixat bugg: import skrev tidigare rätt över befintlig husdata (även med tomma fält). Nu: förhandsgranskning där du väljer vilka fält som ska sparas, inget sparas automatiskt.
- ✅ "Sök mer info om huset" — AI-sökning (Google-grunding via Gemini, gratis upp till 1500 sökningar/dag) efter taxeringsvärde, tomtarea, kommun m.m. Visas som förslag, sparas bara om du väljer det.
- ✅ Karta över husets läge på Översikt (gratis OpenStreetMap, ingen nyckel) — dyker upp automatiskt när en adress är sparad.
- ⏳ SMHI-väderdata i rådgivaren — utlovat, inte byggt än.
- ⏳ Desktop-skiss (mer "flashig" vy man kan se sitt hem i) — utlovad, inte levererad. Näst på tur.
- ⏳ Besiktningsprotokoll → automatisk att-göra-lista — inte påbörjat, behöver avgränsas (Noa: vad är "klar" här, binärt?) innan det byggs.
- ⏳ Projekt med budget + tips från flera agenter — inte påbörjat, samma sak: behöver avgränsas till ett konkret, verifierbart mål innan bygge.
- 🧊 Fastighetsregister/energideklaration via Boverket/Lantmäteriet — kräver BankID-signerat avtal/konto, inte en snabb integration. Väntar på beslut om det är värt att göra just nu.

## Process

- ✅ Den här filen — statuslista så du kan se vad som är klart/pågår/inte påbörjat, och stämma av innan något kallas klart.

---

**Regel framåt:** varje nytt önskemål från Daniel läggs till här innan arbetet börjar. Inget markeras ✅ förrän det faktiskt är verifierat (kört, testat eller kontrollerat mot systemet) — inte bara "borde fungera".
