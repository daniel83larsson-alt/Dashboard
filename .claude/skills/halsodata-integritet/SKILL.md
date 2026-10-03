---
name: halsodata-integritet
description: Checklista för integritet och GDPR när en ändring rör hälsodata (sömn, puls, HRV, vikt, mått, mat, träning) eller personuppgifter i DL Trainer. Använd innan nya datafält, nya externa tjänster, AI-anrop med användardata, mejl/notiser eller radering/export byggs.
---

# Hälsodata och integritet (DL Trainer)

Sömn, puls, HRV, vikt och midjemått är **känsliga personuppgifter** (hälsodata, GDPR art. 9). Det här är en checklista, inte juridisk rådgivning — flagga osäkerhet till Daniel, avgör inte på egen hand.

Kör igenom punkterna för ändringen och svara **Kritiskt / Varning / Info** (Rileys format) med förslag till fix. Verifiera mot koden och databasen, anta inget.

## 1. Vilken data, varför, hur länge
- Vilka nya fält/tabeller sparas? Behövs de för funktionen, eller är det "kan vara bra att ha"? (dataminimering)
- Finns en tydlig anledning användaren skulle förvänta sig att just det sparas?
- Hur länge sparas det? Finns radering när kontot tas bort (inklusive nya tabeller, `ON DELETE CASCADE` eller radering i raderingsflödet)?

## 2. Vem ser den
- RLS påslaget på nya tabeller, policy med ägarkoll (`auth.uid() = user_id`), `WITH CHECK` på UPDATE. Använd skillen `supabase`.
- `SECURITY DEFINER`-funktioner: kontrollerar de `auth.uid()` själva? Kan en annan användare läsa någons data via dem?
- Vänflödet/community: visas bara det användaren medvetet delat (pass, inte sömn/vikt/puls/kalorier om inte uttryckligen valt)?
- Admin-sidor: visar de mer än nödvändigt om enskilda användares hälsodata?

## 3. Lämnar den vår databas?
För varje ny extern mottagare (AI-modell, mejltjänst, push, felrapportering, analys, nätverksanrop):
- Vilken data skickas? Hälsodata eller identifierare (namn, e-post) i AI-promptar, felrapporter (Sentry), loggar eller mejl?
- Är mottagaren ett personuppgiftsbiträde vi redan har med i integritetstexten? Var behandlas data (EU/utanför)?
- Användarens egen API-nyckel (`profiles.llm_api_key_encrypted`): går data då till användarens eget konto hos leverantören — sägs det tydligt?
- Hemligheter: inga nycklar/tokens i loggar, URL:er, felmeddelanden eller klientkod.

## 4. Användarens rättigheter
- Kan användaren se vad som sparats, exportera det och radera sitt konto med all data (även nya tabeller, lagrade bilder, cachade historiker, kopplade konton som Garmin/Strava/YAZIO-tokens)?
- Kan användaren koppla bort en integration och därmed få tokens raderade?
- Samtycke: kräver ändringen nytt samtycke eller ny information till användaren (t.ex. ny extern tjänst, ny typ av analys)?

## 5. Mejl och notiser
- Innehåller mejl/push hälsodata i klartext? (Visas på låsskärm, hamnar i andras inkorgar vid delad enhet.) Avregistreringslänk fungerar?
- Fungerar avregistrering utan inloggning på ett säkert sätt (signerad token, inte gissningsbart id)?

## 6. Loggar och felsökning
- Loggas hälsodata eller personuppgifter i serverloggar, `llm_usage` eller felrapporter? Logga mått (antal tokens, status), inte innehåll.
- Testdata: riktiga användares data får inte kopieras till test/demo (demokontot ska vara påhittat).

## Rapportera
Avsluta med: vad som är OK, vad som är Kritiskt/Varning, och vilka frågor som **Daniel eller en jurist** behöver avgöra (t.ex. integritetspolicyns ordalydelse, biträdesavtal, lagringstid). Lägg beslutade genvägar under "Teknisk skuld" i `STATUS.md`.
