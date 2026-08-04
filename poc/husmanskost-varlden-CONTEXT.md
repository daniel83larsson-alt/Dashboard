# CONTEXT.md — Världens Husmanskost

Delat språk för husmanskost-projektet. Gäller `husmanskost-varlden.html`
och `husmanskost-varlden-README.md`. Helt separat från
iCore/Azure-arbetet i samma mapp — se `CONTEXT.md` för det.

## Kärnbegrepp

- **Husmanskost, försvenskad** — kärnkonceptet: enkla, vardagliga rätter från olika länder, men anpassade till vad som faktiskt går att köpa i en vanlig svensk matbutik. Inte importvaror man bara använder en gång.
- **Nyckelkryddor** — de få kryddorna/ingredienserna som är värda att köpa in för att "låsa upp" ett helt lands kök, i motsats till en hel hylla specialvaror för en enda rätt. Visas separat och tydligt i receptvyn.
- **Kärnlöftet** — roligare mat hemma, utan att köpa ihjäl sig med grejer man ändå inte gör slut på. Det är måttstocken varje ny funktion vägs mot, särskilt inköpslista-optimeringen.
- **"Vad har du hemma"-matchning** — enkel klient-side procentmatchning mellan vad användaren skriver in och en rätts ingredienslista. Inte AI-driven i nuvarande POC — medvetet enkel för att hålla nere kostnad/scope.
- **Substitut-AI** — riktigt Gemini-anrop i receptvyn: "jag har inte X, vad kan jag använda istället." Skiljs från matchningen ovan — det här är AI, matchningen är det inte.
- **Inköpslista-optimering** — riktigt Gemini-anrop som slår ihop upp till 5 valda rätters ingredienser till en lista, räknar ihop dubbletter och flaggar överköp. Den funktion som bäst fångar kärnlöftet.
- **Diet-taggar** — veg / pesk / kött. Ett av tre kombinerbara filter (de andra: tid, land/världsdel).
- **Nyckel-läge** — Gemini API-nyckeln matas in av var och en som testar och sparas bara lokalt i webbläsaren (localStorage). En medveten POC-genväg, inte en produktionslösning — se README för vad som krävs innan fler än en person ska kunna använda AI-delarna.
