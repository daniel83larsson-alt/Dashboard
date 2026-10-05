# SPEC (från Daniel, 2026-10-05): Träning vs vardagsrörelse + veckofeedback

Sparad ordagrant som beställning. Status: ANALYSFAS — inget byggt, inget ändrat i data förrän Daniel godkänner.

SYFTE
Användare som loggar promenader och pendling får missvisande statistik (antal pass, km). Intensiteten ska avgöra vad som är träning. Användaren ska få tydlig feedback på sin träning och sin vecka.

BEGREPP (sv / en)
- Träning / Training: planerad belastning med tillräcklig intensitet
- Vardagsrörelse / Everyday movement: promenad, lugn cykling, pendling
- Pendling: valfri tagg på ett pass, inte en egen kategori
- Aktiva minuter: träning + vardagsrörelse (WHO: 150-300 min/vecka)
- Intensitetsminuter: Z2-Z3 = 1 min, Z4+ = 2 min

KLASSNING (första träff gäller)
1. Användaren har valt själv: använd den
2. Styrka med loggade set: TRÄNING
3. Rodd/löpning/cykel med puls: TRÄNING om duration >= 20 min OCH puls >= 80% av LTHR (eller >= 50% av tiden i Z2+ om zondata finns)
4. Annars: VARDAGSRÖRELSE
5. Saknas puls: gång eller cykel under 60 min = VARDAGSRÖRELSE, annars föreslå tagg till användaren
LTHR sätts per användare (min: 149). Saknas LTHR: använd 65% av HRmax.
Hård pendling blir TRÄNING och behåller taggen Pendling.
Föreslå taggen Pendling (bekräfta med knapp): cykel/gång, under 30 min, vardag, samma start och slut flera dagar.

DATAMODELL
category (training | daily_movement), category_source (auto | user), tags[], intensity_minutes. Migrera historiska pass med samma regler. Ändra inget utan mitt godkännande.

ÖVERSIKT (vy)
Steg idag        8 381 / 7 000
  varav gång     65 min · 5,3 km
  Cykling (ger inga steg)  18 min · 6,2 km
Träning denna vecka  4 pass · 5 dagar
Gångpass finns redan i stegen: visa dem som uppdelning, inte som ny summa.

VECKOKORT
- Rörelse: aktiva minuter mot 150, snittsteg mot mål
- Träning: pass, träningsdagar, lugnt/hårt mot 80/20, styrkepass mot 2
- Effekt (4 v): pace vid given puls, vilopuls, styrkeprogression, vikttrend
- Återhämtning: sömn, Body Battery
- Nästa vecka: 1-2 åtgärder, inte fler
Regler: jämför med egna mål och WHO, inte andra. Max 1-2 insikter. Visa effekt över tid, inte per pass. Betygsättning av pass finns i separat spec.

LEDARTAVLA
Träning som standard. Växlare "Inkludera vardagsrörelse". Pendling syns i flödet.

KCAL
Vardagsrörelse räknas via steg/NEAT, inte som separat träningsförbränning, så att rörelsen inte räknas två gånger.

UPPGIFT (gör detta först, bygg inget än)
1. Läs nuvarande datamodell och vyer. Ge en kort plan för ändringarna.
2. TA FRAM EXEMPEL på riktig data: kör klassningen på mina pass de senaste 4 veckorna. Tabell med datum, passtyp, tid, puls, kategori och vilken regel som slog till. Lyft gränsfall.
3. Visa mockup av översiktsraden och veckokortet med mina riktiga siffror.
4. Skriv testfall för reglerna. Minst: Vandring 9 min puls 101 → Vardagsrörelse; Vandring 28 min puls 91 → Vardagsrörelse; Vandring 37 min puls 102 → Vardagsrörelse; Rodd 30 min puls 125 → Träning; Rodd 30 min puls 144 → Träning; Kettlebell 20 min, set loggade → Träning; Cykel 10 min puls 95 vardag → Vardagsrörelse + föreslagen tagg Pendling.
5. Vänta på mitt OK innan du ändrar något.
