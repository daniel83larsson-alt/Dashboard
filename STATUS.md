# STATUS

Ägs av Alex. Varje nytt önskemål/fråga från Daniel loggas här innan arbetet påbörjas. Markeras ✅ först när det är verifierat mot systemet (inte bara "borde fungera").

## Öppna / pågående

- ⏳ Verifiera Eufy-integration (fas 1): Daniel behöver köra `eufy-integration/` lokalt på sin egen dator (docker-compose + `watch_events.py`) med sina riktiga Eufy-uppgifter, göra ett testgång framför uppfartskameran, och rapportera vad som skrivs ut i terminalen. Inte verifierat än – bara koden förberedd och research bekräftad mot källkoden i `bropat/eufy-security-ws`.

## Klara

- ✅ Ta fram loop-prompt för POC "hastighetsdetektering via webbkamera" (identifiera rörliga objekt + snitthastighet). Scope klargjort med Daniel: webbläsare, manuell kalibrering via känt referensmått, stoppvillkor = grön Playwright-testsvit. Sparad i `docs/poc-speed-detection-prompt.md`. Verifierat: filen finns i repot. (2026-07-05)

- ✅ Uppdatera `CLAUDE.md` med saknade roller (Nova, Viktor, Robin, Noa) och saknade regler, jämfört med Daniels fullständiga devteam-fil. Verifierat: filen läst tillbaka och innehåller alla fyra roller samt de fem extra reglerna. (2026-07-05)
- ✅ Skapa `STATUS.md` i repo-roten. Verifierat: filen finns på `/home/user/Dashboard/STATUS.md`. (2026-07-05)
