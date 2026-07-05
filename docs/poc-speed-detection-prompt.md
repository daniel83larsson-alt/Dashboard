# POC: Hastighetsdetektering via webbkamera (loop-prompt)

## Mål
Bygg en webbaserad POC (ren HTML/CSS/JS, ingen backend, körs lokalt i webbläsaren) som:
1. Startar användarens kamera (`getUserMedia`).
2. Låter användaren kalibrera skalan genom att peka ut två punkter i bilden som motsvarar ett känt avstånd (t.ex. en tumstock på marken, eller en bils takhöjd ~1,5 m) och skriva in det verkliga måttet i cm/m.
3. Efter kalibrering: identifierar rörliga objekt (bil, cyklist, person m.fl.) i videoströmmen med en klientside-modell (t.ex. TensorFlow.js + coco-ssd), ritar en bounding box runt varje spårat objekt.
4. Beräknar och visar en löpande hastighet (km/h) per spårat objekt, baserat på pixelförflyttning mellan bildrutor, tidsstämplar och kalibreringens pixel-till-meter-skala.
5. **Känd begränsning för v1** (ok att dokumentera, inte lösa): kalibreringen antar att det spårade objektet rör sig i ungefär samma djupplan/avstånd från kameran som referensmätningen (t.ex. ett objekt som passerar i sidled framför kameran, inte ett som kommer rakt emot den). Perspektivkorrigering för godtyckligt djup är utanför scope.

## Teknik
- Ren HTML/CSS/JS – inga byggsteg, ska gå att öppna direkt i webbläsaren.
- TensorFlow.js + coco-ssd (eller motsvarande) för objektdetektion i klienten.
- Enkel egen tracker (centroid/IOU-matchning) för att koppla samma objekt mellan bildrutor.
- Ingen serverdel, inget Claude API-anrop krävs i själva mätningen (objektklasserna kommer redan från CV-modellen). Claude API kan läggas till senare som extra lager för naturligt språk, men är INTE en del av v1-scope.

## Definition of Done / stoppvillkor (verifierbart, ingen mänsklig bedömning)
En Playwright-testsvit (headless Chrome med `--use-fake-device-for-media-stream` och en inspelad testvideo som fake kamera) ska passera grönt och verifiera:
1. Sidan laddar utan konsolfel.
2. Kalibreringsgränssnittet visas, accepterar två klick + ett numeriskt värde, och går vidare till mätläge.
3. Minst en bounding box ritas ut inom 5 sekunder efter start (testvideon innehåller ett rörligt objekt).
4. Ett hastighetsvärde (numeriskt, > 0) visas och uppdateras minst en gång under en 15 sekunders körning.
5. Inga ohanterade JS-exceptions kastas under hela körningen.

Loopen är KLAR när denna testsvit returnerar exit code 0. Ingen annan definition av "klart" gäller.

## Skyddsräcken (obligatoriska, se Noa)
- **Mönster:** Headless while-loop (bygg → kör Playwright-testsvit → om fail, mata tillbaka exakt vilka steg som failade → bygg om).
- **Hårt tak:** max 8 varv.
- **Budget:** max ~45 minuters sammanlagd körtid. Avbryt och rapportera om taket nås utan grönt test.
- **Sandlåda:** allt arbete sker i en egen gren/worktree (t.ex. `poc/speed-detection`), aldrig direkt mot main/produktion.
- **Mänsklig avstämning:** ingen push till main, ingen deploy, inga externa meddelanden. Avsluta loopen med en sammanfattning och vänta på Daniels godkännande innan nästa steg (t.ex. PR).

## Modellval (se Robin)
- Byggagenten: Sonnet (standard, koduppgift av normal komplexitet).
- Playwright-testkörningen i sig kräver ingen modell – det är ett deterministiskt skript, inte en LLM-bedömning.
- Ingen eskalering till Opus planerad. Om Sonnet visar sig otillräcklig efter flera failade varv, flagga det innan ni eskalerar.
