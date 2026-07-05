# Reguli de business — Tarifator

Regulile de domeniu (contabile + de produs) pe care se bazeaza aplicatia.
Sunt reguli STABILE — nu descriu cod care se schimba des, ci logica pe care
codul TREBUIE s-o respecte. Cand modifici o formula sau o limita, actualizeaza
si aici. Fisierele de cod sunt trecute ca referinta, nu ca sursa de adevar.

---

## 0. Trei axe care se confunda usor (citeste asta primul)

Aplicatia are TREI concepte diferite care par similare. NU le amesteca:

1. **Modul** = ce face aplicatia. Doua module:
   - **Calculator Pret** (`/pricing`, `/calcule`) — calculeaza pret de vanzare din facturi de furnizor.
   - **Fise Servicii** (`/quick`, `/quotes`, `/services`, `/clients`) — fise pentru clienti.
2. **Mod de lucru** (`profiles.account_type` = `artizan` | `pro`) = regimul de lucru, LIBER pentru toti, fara legatura cu plata:
   - `artizan` ("Simplu") — fara TVA, o singura firma (datele contului).
   - `pro` ("Firma") — cu TVA, mai multe firme.
3. **Tip de cont / abonament** (`profiles.plan_tier` = `free` | `artizan` | `mercator` | `pro`) = ce a PLATIT userul; controleaza DOAR limitele lunare (vezi cap. 5).

Numele "artizan"/"pro" apar la 2 si la 3 — sunt concepte DISTINCTE. In UI: axa 2 se numeste "Mod de lucru", axa 3 "Abonament". `Mercator` = numele tipului de cont (3) care deblocheaza Calculatorul de Pret; NU e numele modulului (modulul se cheama "Calculator Pret").

---

## 1. TVA

- Cotele ACTUALE in Romania: **11% (redusa)** si **21% (standard)**. NU 9%/19% (alea sunt pre-2024; pe facturi vechi 9%=>11, 19%=>21).
- Aplicatia foloseste DOAR 11 sau 21 intern.
- **Cota redusa 11%**: apa potabila, alimente si bauturi nealcoolice (om/animal), lapte/carne/oua/paine/faina/zahar/ulei/legume/fructe/conserve/condimente, hrana animale, animale vii domestice, lemne de foc, energie termica, carti/ziare/reviste, cazare hoteliera.
- **Cota standard 21%**: orice altceva — bauturi alcoolice, suplimente/vitamine, cosmetice, detergenti, electrice/electronice, textile/incaltaminte, jucarii, unelte, materiale de constructii, papetarie.

## 2. Regim TVA: platitor vs neplatitor

`vat_rate` (pe firma sau pe profil): `0` = neplatitor, `11`/`21` = platitor. In calculator, `vatPayer = vat_rate !== 0`. Sursa: firma activa (mod Pro) sau profilul (mod Artizan).

Pretul furnizorului introdus/scanat e MEREU fara TVA (net).

- **Platitor** (`vatPayer=true`): adaosul se pune pe net, apoi se ADAUGA TVA la client.
  `net → +adaos → pret fara TVA → +TVA(11/21) → pret cu TVA` (linie de TVA separata catre client).
- **Neplatitor** (`vatPayer=false`): TVA-ul platit furnizorului e cost IRECUPERABIL, intra in cost; NU se adauga TVA la client.
  `net → +TVA furnizor → pret intrare (cu TVA) → +adaos → pret vanzare` (fara TVA la client).

Referinta: `lib/pricing/calc.ts` (`calcItem`).

## 3. Adaos si rotunjire

- **Adaos** = procent aplicat pe costul de intrare (dupa discount).
- **Rotunjire pret final**: fara / 0.10 / 0.50 / 1.00 lei, mod "la cel mai apropiat" sau "in sus".
- **Discount** furnizor = procent, se scade din pretul furnizorului INAINTE de adaos (nu se aplica pe pretul brut de doua ori).

## 4. SGR (Sistemul Garantie-Returnare) — cerinta legala

- SGR = **0,50 lei fix** per unitate de ambalaj returnabil.
- **Ce produse au SGR (HG 1074/2021)**: BAUTURILE in ambalaje nereturnabile de plastic/sticla/metal intre **0,1 si 3 litri** — apa, sucuri/nectaruri/racoritoare, bere, cidru, vin, spirtoase, energizante. **NU au SGR**: laptele si lactatele (iaurt/kefir/sana), siropurile, tot ce nu e bautura (ulei/otet), ambalajele peste 3L (bidonul de 5L) sau sub 0,1L. Clasificarea e in cod (`classifySgr`, `lib/pricing/scanGuards.ts`) ca plasa de siguranta finala — semnalele de pe DOCUMENT (SGR/NAVETA in denumire, linia de garantie asociata) au prioritate.
- **UM lipsa sau "L"/"ML"** la scanare => `buc` (litrajul din denumire nu e unitate de masura; sticlele se vand la bucata). `kg` ramane `kg` (cantarite reale).
- NU face parte din pretul produsului; NU intra in baza de calcul a adaosului sau a TVA. Se afiseaza separat ("+0,50 SGR").
- Linii de tip "SGR", "GARANTIE PET/STICLA/DOZA", "AMBALAJ SGR", "Garantie-Returnare" NU sunt produse — se exclud din lista; daca o astfel de linie are cantitatea = suma cantitatilor produselor de bautura, se aplica `sgr=0.50` la acele produse.
- Produse cu "NAV"/"NAVETA" in denumire => `sgr=0` (returnate pe naveta, nu individual).

## 5. Tipuri de cont (abonament) si limite

Fiecare tip de cont are limite LUNARE diferite pe cele doua module:

| Tip cont | Pret | Primii 50 (dupa lansare) | Fise/luna | Calcule/luna |
|---|---|---|---|---|
| Free | gratis | gratis | 3 | 3 |
| Artizan | 59 lei | 39 lei | nelimitat | 3 |
| Mercator | 129 lei | 89 lei | 3 | nelimitat |
| Pro | 149 lei | 99 lei | nelimitat | nelimitat |

- **Freemium**: primele 30 de zile de la inregistrare, un cont Free primeste 30 fise + 30 calcule (in loc de 3+3), apoi cade pe Free. Free e podeaua permanenta — nimeni nu ramane blocat complet.
- **PRELAUNCH** traieste in DB: `app_config`, cheia `prelaunch`. Cat e `true`, oricine e tratat ca Pro (totul nelimitat). Se stinge la lansare cu UN SINGUR update: `update app_config set value='false' where key='prelaunch';` — UI-ul (`lib/plan.ts`) si triggerele DB citesc amandoua de acolo.
- **Limitele sunt IMPUSE si in DB** (triggere pe `quotes` si `pricing_usage` — `supabase/enforce-limits.sql`), nu doar in UI: altfel un user tehnic le-ar ocoli scriind direct in Supabase cu propriul token. Daca schimbi limitele in `lib/plan.ts`, oglindeste-le si in SQL.
- Activarea unui abonament platit e MANUALA (se seteaza `plan_tier` + `plan_active_until` in DB) pana la integrarea unui procesator de plati.
- Numararea consumului e pe luna calendaristica: fise = tabelul `quotes`, calcule = `pricing_usage`.

Referinta: `lib/plan.ts` (`TIER_LIMITS`, `getEffectiveLimits`), `lib/usage.ts`, `supabase/enforce-limits.sql`.

## 6. Scanare facturi — impartirea rolurilor

Principiu central: **AI-ul doar CITESTE si TRANSCRIE numere brute; TOATA aritmetica se face determinist in cod** (`app/api/parse-invoice/route.ts`, `validateAndSanitize`). Modelele gresesc la calcul; codul nu.

- **Furnizor**: firma reala din antet. `Meti`/`Oblio`/`WinMENTOR` = soft de facturare, NU furnizorul. Daca nu apare, se lasa gol (nu se inventeaza).
- **Pret**: `price_raw` = pretul unitar tiparit + `price_includes_vat` (din header: "TTI"/"cu TVA" => true; "net"/"fara TVA" => false). Verificare: `cantitate × pret ≈ valoarea randului` — daca nu se potriveste, citirea e gresita.
- **Cutie/bucata** (cap. 7).
- **Formate**: factura/aviz (tabel cu coloane), bon fiscal de casa de marcat (Lidl/Kaufland — layout inversat, pret cu TVA inclus, legenda de litere TVA A/B/C/D citita de pe bonul curent), e-Factura.
- **e-Factura (XML UBL / RO_CIUS + PDF-ul oficial ANAF)**: EXCEPTIE de la regula AI — fiind date STRUCTURATE (XML) sau layout national FIX (PDF-ul "RO eFactura" generat de ANAF), se citesc 100% determinist in cod (`lib/pricing/efactura.ts`), FARA AI, fara sa consume din cota de scanari. Per linie: nume + pret unitar fara TVA + cota TVA declarata + cantitate; verificare `cantitate x pret ≈ valoarea randului`. Pretul de bax se imparte pe bucata dupa "x N" din denumire; SGR din denumire; liniile de AMBALAJ SGR / garantie se exclud. XML-ul se intercepteaza in client INAINTE de calea AI; PDF-ul ANAF pe server, dupa extragerea textului. PDF-urile cu layout propriu al furnizorului raman pe calea AI.
- **Garduri deterministe peste orice citire AI** (`lib/pricing/scanGuards.ts`): (1) o linie de garantie/ambalaj SGR intai MARCHEAZA produsul precedent cu aceeasi cantitate (`sgr=0.50` — facturi Metro/Supeco, unde produsele nu au "SGR" in denumire), apoi se filtreaza din lista SI in cod (modelul uneori le scapa ca produse); linia cumulata de la finalul facturii (cantitate = suma) nu marcheaza nimic. (2) `reconcileUnitPrice` alege pretul care satisface `cantitate x pret ≈ valoare`, tinand cont de discount (valoarea randului poate fi deja neta de discount) si de separatorul romanesc de mii ("4.560" = 4560 bucati — factorul 1000 dintre declarat si derivat inseamna cantitate citita gresit, nu pret gresit). (3) Randurile-FANTOMA (`phantomRowIndexes`): zona de sub un produs (cod de bare + cantitate) citita ca produs nou se elimina DOAR cu semnatura dubla — nume trunchiat (prefix al unui rand verificat) + fara cantitate/valoare proprii; doua produse reale au amandoua date de rand, deci nu se ating intre ele.
- **Discount global** ("SCONTURI ACORDATE X%") si **SGR** — vezi cap. 4.

## 7. Cutie / bucata (box vs piece)

- Decizia "se imparte pe bucata?" se ia din **coloana UM** a randului (determinist in cod), NU din text: doar UM de tip `Cut`/`Cutie`/`Bax`/`Bx`/`Set` se imparte; `Buc`/`ST`/`kg` raman ca atare.
- Raportul bucati/cutie se ia din DENUMIRE daca e scris ("24BUC/CUT" => 24). Un "18 BUC/CUT" cand UM=Buc e doar info de ambalare — NU se imparte.
- **Raport imprumutat de la "frate"**: un produs-cutie fara raport in nume imprumuta raportul de la alt produs-cutie cu ACELASI pret de cutie + aceleasi prime 3 cuvinte din denumire (util cand furnizorul nu scrie raportul pe fiecare rand).
- Corectiile manuale de raport (butonul "Corecteaza cutie/bucata") sunt PARTAJATE intre utilizatori (ADR-024): ambalarea e a furnizorului, nu a clientului — corectia unui user ii ajuta pe toti la acelasi furnizor. Prioritate: corectia PROPRIE bate corectiile altora (fiecare se poate apara singur de o valoare gresita). Plafonul 2-500 bucati/cutie respinge valorile absurde la scriere.

## 8. Numerotare fise

- Format: `DR-YYYYMM-NNN`.
- Scop: per firma (mod Pro) sau per user (mod Artizan, fara firma), si per luna calendaristica.
- Numarul = `max(secventa existenta in scope luna asta) + 1` (nu count+1 — count-ul scade la stergere si ar reproduce un numar deja folosit).

Referinta: `lib/quoteNumber.ts`.

## 9. Limite AI (Groq) — constrangere de infrastructura, nu de cod

- Scanarea foloseste Groq (model de vedere pentru poze, model text pentru PDF/dictare). Pe planul GRATUIT: ~30.000 tokeni/minut si ~500.000 tokeni/zi per model.
- O factura densa se citeste pe felii (2-4, secvential, cu retry pe limita de rata). Cand cota zilnica e epuizata, scanarea iese incompleta — NU e bug de cod, e plafonul planului. Solutie: plan Groq Dev (limite ~10×) sau asteptarea resetului.
- Rate-limit propriu per user: 50 scanari/zi (`invoice_scan_logs`), 300/zi pe transcribe/parse-pricing/parse-quote/edit-quote (`api_usage`).

---

## 10. Harta codului (unde traieste fiecare regula)

Repere scurte, ca sa te orientezi rapid. Sunt STABILE (locatiile nu se muta des):

- **Scanare factura / OCR + parsare**: `app/api/parse-invoice/route.ts` (model Groq citeste, `validateAndSanitize` face aritmetica). UI: `app/pricing/hooks/useInvoiceScan.ts`, `app/pricing/InvoiceScanner.tsx`.
- **Calcul pret (TVA, adaos, rotunjire, neplatitor)**: `lib/pricing/calc.ts`. Regimul TVA: `app/pricing/hooks/usePricingDraft.ts`.
- **Abonamente + limite**: `lib/plan.ts` (`TIER_LIMITS`, `getEffectiveLimits`, `PRELAUNCH`), consum lunar in `lib/usage.ts`.
- **Numerotare fise**: `lib/quoteNumber.ts`.
- **Generare PDF**: calculator → `lib/pricing/pdf.ts`; fisa → `app/quotes/[id]/page.tsx` (`buildPDF`). Preview mobil: `lib/pricing/pdfPreview.ts`.
- **Dictare voce**: `app/api/transcribe/route.ts` (Whisper) → `app/api/parse-quote/route.ts` / `parse-pricing`.
- **Auth pe rutele API**: `lib/apiAuth.ts` (`verifyBearer`), rate-limit `lib/rateLimit.ts`.
- **Module + mod de lucru pe dashboard**: `app/dashboard/page.tsx`, `lib/module.ts`.

## Idei de roadmap (NU implementate — nu sunt reguli)

Mutate in `docs/ROADMAP.md` (sursa unica). Deciziile asumate: `docs/DECISIONS.md`.
