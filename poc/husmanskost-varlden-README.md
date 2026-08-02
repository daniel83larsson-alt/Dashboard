# Världens Husmanskost — projektkunskap

Det här dokumentet är tänkt att kunna ges till ett nytt team utan att de
behöver ha varit med i den ursprungliga diskussionen. Allt som beslutats
och byggts hittills finns här.

## Idén i korthet

En sajt om världens husmanskost — enkla, vardagliga rätter från olika
länder, men **försvenskade**: ingredienser man faktiskt hittar i en
vanlig svensk matbutik, inte importvaror man bara använder en gång.

Kärnlöftet: laga roligare mat hemma, utan att köpa ihjäl sig med grejer
man ändå inte använder upp.

## Målgrupp och kärnvärde

Hemmakockar som vill bryta vardagsrutinen (pasta/tacos/husmanskost i
slentrian) men som blir avskräckta av recept som kräver en hel hylla
specialingredienser för en enda rätt. Sajten löser det genom att vara
tydlig med **vad som faktiskt krävs** för att laga ett helt lands kök —
en handfull nyckelkryddor, inte tjugo.

## Hur sajten fungerar (användarflödet)

Tre sätt att hitta en rätt, kombinerbara:
1. **Tid** — Snabb / Medel / Middag
2. **Diet** — Vegetariskt / Pesketariskt / Med kött
3. **Land eller världsdel** — bläddra efter kök

Ett fjärde sätt: **"Vad har du hemma?"** — användaren skriver in vad de
redan har (kommaseparerat), sajten sorterar rätterna efter hur stor
andel av ingredienserna som redan finns hemma (matchning i procent).

Varje rätt har en detaljvy med ingredienslista, tydligt markerade
**nyckelkryddor** (de få sakerna värda att köpa in för att låsa upp hela
landets kök), och numrerade steg.

Man kan lägga till upp till **5 rätter** i en inköpslista.

## Det unika — AI-delen

Två AI-funktioner, båda med riktiga anrop till Gemini (inte simulerade):

1. **Ingrediens-substitut** — i receptvyn: "jag har inte X, vad kan jag
   använda istället?" AI:n svarar kort och konkret utifrån vad som
   troligen redan finns hemma eller är lätt att hitta.
2. **Inköpslista-optimering** — när flera rätter är valda: AI:n slår
   ihop dubbletter, räknar ihop rimliga totalmängder, och — viktigast —
   flaggar när något bara behövs i en liten mängd till en enda rätt, så
   man kan hoppa över att köpa en hel förpackning man ändå inte gör slut
   på. Det är den här funktionen som bäst fångar kärnlöftet ovan.

## Vad som redan finns (POC)

En körbar, klickbar prototyp finns redan:
- **Fil i repot:** `poc/husmanskost-varlden.html` (vanilla HTML/CSS/JS,
  en enda fil, inga beroenden, öppnas direkt i valfri webbläsare)
- **Publicerad länk:** https://claude.ai/code/artifact/65a139c6-5d09-4147-a3e5-6298816ac301
  (privat till kontot som publicerade den — dela via delningsmenyn på
  sidan om andra ska se den)
- **Repo/gren:** `daniel83larsson-alt/dashboard`,
  branch `claude/small-business-accounting-site-xzb7ph`

Innehåll i POC:en just nu: **15 rätter över 5 länder** — Italien,
Mexiko, Thailand, Indien och Levanten (Mellanöstern) — med minst en
rätt per diet-kategori (veg/pesk/kött) och spridning över alla tre
tidslägen, för att kunna testa alla filterkombinationer meningsfullt.

## Tekniska beslut och varför

- **Vanilla HTML/JS, ingen backend.** Matchar hur andra POC:ar i det
  här teamet byggs — snabbt att testa, inget att installera. Bra för
  att bevisa känslan, inte tänkt att vara slutlösningen.
- **Gemini som AI-motor**, inte OpenAI/Claude — matchar konventionen i
  övriga produkter teamet redan byggt.
- **API-nyckeln matas in av användaren själv och sparas bara lokalt i
  webbläsaren** (localStorage). Ingen nyckel ligger i koden eller i
  git. Detta är en **POC-genväg**, inte en produktionslösning — se
  begränsningar nedan.

## Kända begränsningar / vad som INTE är löst än

- **Nyckeln är per person och per webbläsare.** Varje ny testare måste
  klistra in sin egen Gemini-nyckel. I en riktig produkt ska AI-anrop
  gå via en egen backend så att ingen slutanvändare någonsin hanterar
  en API-nyckel själv.
- **Receptinnehållet ligger hårdkodat i filen**, inte i en databas.
  Funkar för 15 rätter, blir opraktiskt att underhålla om det växer
  bortom en handfull länder.
- **Ingen känd källa/upphovsrätt är fastställd** för recepten — de är
  skrivna för POC:en, inte hämtade eller granskade mot en specifik
  kokbok eller kulturell referens. Bör ses över innan publik lansering.
- **Ingen affärsmodell diskuterad än** — varken prissättning, annonser
  eller något annat sätt att sajten ska bära sig själv.

## Öppna frågor för nästa team

- Hur stort ska receptbiblioteket bli, och vem skriver/granskar
  recepten när det växer förbi en handfull länder?
- Ska AI-anropen flyttas bakom en egen backend innan fler än en person
  (upphovsmannen) ska kunna testa AI-delarna?
- Finns intresse för fler filtertyper (allergier, portionsstorlek,
  årstid) eller ska scopet hållas smalt medvetet?
- Ska "vad har du hemma"-matchningen bli AI-driven istället för enkel
  textmatchning, om den nuvarande känns för trubbig i praktiken?
