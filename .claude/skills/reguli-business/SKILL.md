---
name: reguli-business
description: >-
  Regulile de domeniu (contabile + de produs) ale tarifatorului DevizRapid.
  Foloseste ORICE data cand modifici sau discuti logica de TVA (cote 11/21,
  platitor vs neplatitor), adaos si rotunjire, SGR (garantie-returnare 0,50 lei),
  cutie vs bucata, tipuri de cont / abonamente si limite lunare (Free/Artizan/
  Mercator/Pro), numerotarea fiselor (DR-YYYYMM-NNN), scanarea facturilor
  (parse-invoice, e-Factura, garduri deterministe) sau limitele AI Groq.
  Sursa de adevar este devizrapid/BUSINESS_RULES.md — citeste-o INAINTE de a
  atinge codul de business.
---

# Reguli de business — Tarifator DevizRapid

Aplicatia are reguli de domeniu STABILE (contabile + de produs) pe care codul
TREBUIE sa le respecte. Ele traiesc in **`devizrapid/BUSINESS_RULES.md`**, care
este singura sursa de adevar. Fisierele de cod sunt referinta, nu sursa.

## Cand se aplica acest skill

Foloseste-l ori de cate ori atingi sau explici:

- **TVA** — cote 11% (redusa) / 21% (standard), platitor vs neplatitor.
- **Adaos si rotunjire** — procent pe cost, discount furnizor, rotunjire finala.
- **SGR** — garantie-returnare 0,50 lei/unitate, ce produse au/nu au SGR.
- **Cutie vs bucata** — impartirea pe bucata din coloana UM si din denumire.
- **Abonamente si limite** — Free / Artizan / Mercator / Pro, limite lunare, PRELAUNCH.
- **Numerotare fise** — format `DR-YYYYMM-NNN`, scope pe firma/user + luna.
- **Scanare facturi** — `parse-invoice`, e-Factura (XML/PDF ANAF), garduri deterministe.
- **Limite AI (Groq)** — plafoane de tokeni, rate-limit per user.

## Ce sa faci

1. **Citeste `devizrapid/BUSINESS_RULES.md` INTAI**, sectiunea relevanta, inainte
   de a scrie sau propune orice modificare de logica de business. Nu te baza pe
   memorie pentru cote, limite sau clasificari — ele sunt precise si se schimba.
2. **Respecta separarile din capitolul 0**: Modul (Calculator Pret vs Fise
   Servicii) ≠ Mod de lucru (`account_type`: artizan/pro) ≠ Tip de cont
   (`plan_tier`: free/artizan/mercator/pro). Nu le amesteca, desi numele se repeta.
3. **Aritmetica se face in cod, determinist**, nu de AI. La scanare, modelul doar
   citeste/transcrie numere brute; TVA, cutie/bucata, discount, SGR se calculeaza
   in cod (`validateAndSanitize`, `lib/pricing/*`).
4. **Logica de business sta in `lib/` sau `app/api/`**, niciodata in componentele
   UI. Reutilizeaza helperele existente, nu duplica.
5. **Cand schimbi o formula, o limita sau o clasificare, actualizeaza si
   `BUSINESS_RULES.md`** ca sa ramana sincron cu codul. Daca schimbi limitele in
   `lib/plan.ts`, oglindeste-le si in `supabase/enforce-limits.sql` (sunt impuse
   in DB, nu doar in UI).

## Harta rapida a codului (din cap. 10)

- Scanare / OCR + parsare: `app/api/parse-invoice/route.ts` (`validateAndSanitize`).
- Calcul pret (TVA, adaos, rotunjire, neplatitor): `lib/pricing/calc.ts`.
- SGR + garduri deterministe: `lib/pricing/scanGuards.ts` (`classifySgr`).
- e-Factura (XML UBL / PDF ANAF, fara AI): `lib/pricing/efactura.ts` (`mapUnit`).
- Abonamente + limite: `lib/plan.ts` (`TIER_LIMITS`, `getEffectiveLimits`, `PRELAUNCH`),
  consum in `lib/usage.ts`, impunere DB in `supabase/enforce-limits.sql`.
- Numerotare fise: `lib/quoteNumber.ts`.

## Capcane frecvente (nu le repeta)

- Cotele TVA sunt **11/21**, NU 9/19 (alea sunt pre-2024).
- Pretul furnizorului e MEREU net (fara TVA). La neplatitor, TVA-ul furnizorului
  intra in cost (irecuperabil); la platitor se adauga TVA separat la client.
- SGR NU intra in baza de adaos sau de TVA — se afiseaza separat ("+0,50 SGR").
- Numarul de fisa = `max(secventa) + 1`, NU `count + 1` (count-ul scade la stergere).
- Pe e-Factura, `KGM` = pretul e DEJA pe kg, nu se imparte pe bucata.
