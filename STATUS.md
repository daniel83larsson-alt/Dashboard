# STATUS — Bokföringssite för enskild firma

Ägs av Alex. Varje önskemål/fråga från Daniel läggs till här innan arbete påbörjas. ✅ sätts först när det är verifierat mot systemet, inte bara "borde fungera".

## Aktiva/klara punkter

- [x] **CLAUDE.md uppdaterad till hela teamet** (Nova, Viktor, Robin, Noa tillagda) — verifierat: fil skriven till repo-roten, innehåll matchar Daniels uppladdade fil.
- [x] **Scope för bokföringssiten klargjort** — målgrupp: enskild firma (Sverige). Kvittoflöde: AI-tolkning (OCR + Claude), simulerad i POC. Revisor-underlag: SIE-fil (svensk standard).
- [x] **POC byggd** (`bokforing-poc/index.html`) — Maya. Inloggning (simulerad), kontoplan (förenklad BAS), kvittouppladdning → simulerad AI-tolkning → bokföring, transaktionslista, kontosaldon, SIE-export, revisor-godkännande-status. Data sparas i localStorage (POC-begränsning, tydligt kommunicerad i UI).
- [x] **Verifiera POC i webbläsare** — automatiserat via Playwright-loop (Noa/Robin), stoppvillkor: skapa användare → mata in konto → ladda upp fake kvitto → AI-tolka → bokför → data överlever reload → generera SIE-fil. Alla 5 steg godkända på första riktiga körningen.
- [ ] **Daniels validering av POC** — funkar det, känns det rätt? (tekniskt verifierat, men Daniels egen känsla för flödet återstår)
- [x] **Loop-beslut (Noa)** — kört: engångs-verifieringsloop mot bokforing-poc/index.html, körd lokalt i scratchpad, ingen bugg hittad i appen.
- [ ] **Arkitektur (Sam)** — ej påbörjad, väntar på godkänd POC.
- [ ] **Produkt (Chris), Deploy (Jordan), Säkerhet (Riley)** — ej påbörjade.
- [ ] **Affärsmodell/pricing (Nova)** och **sälj/landningssida (Viktor)** — ej diskuterat än.
