# Jurnal de decizii — Tarifator

Fiecare decizie de produs importantă, cu **ce** s-a decis și **DE CE**. Scopul:
proiectul să nu depindă de istoricul conversațiilor.

> Intrările de mai jos au fost documentate retroactiv la **2026-07-03** din sesiunile
> anterioare. De aici înainte, orice decizie nouă cu impact se adaugă la zi (cea mai
> recentă sus). Format: ce s-a decis, de ce, și — unde e util — alternativa respinsă.

---

## ADR-025 — Potrivirea dictare→serviciu se face în cod, nu de model
**Data:** 2026-07-13.
**Decizie:** La dictarea fișelor, modelul (`parse-quote`) întoarce DOAR eticheta
auzită (`label`) + `quantity`, nu un `service_id`. Legarea de serviciul salvat o
face codul (`lib/services/matchService.ts`): normalizare fără diacritice, scoatere
de cuvinte de umplutură/unități/numere, potrivire pe egalitate/substring/suprapunere
de cuvinte cu prag; termenii ambigui (ex. „montaj" pentru două servicii) rămân
NEPOTRIVIȚI intenționat. Ce nu se potrivește se întoarce în `unmatched` și se
afișează în preview („Nerecunoscute: …"), nu se mai aruncă tăcut (`if(!service)
return null`).
**De ce:** Bug real — „3 m de țeavă" nu era prins deși „țeavă" era serviciu salvat:
modelul e slab la echo-ul exact al unui id, dar bun la „ce a spus omul". Mutarea
potrivirii în cod (regula „logica în cod, nu de AI") o face deterministă și
testabilă (12 cazuri reale). Ambiguu → nepotrivit e mai sigur decât legat greșit.

## ADR-024 — Corecțiile cutie/bucată sunt partajate între utilizatori (înlocuiește ADR-010)
**Data:** 2026-07-05.
**Decizie:** `getKnownRatios` citește corecțiile TUTUROR utilizatorilor pentru
furnizorul respectiv, cu prioritate: corecția PROPRIE bate corecțiile altora.
Scrierea rămâne cu `created_by` (știm mereu cine a corectat).
**De ce:** Ambalarea e a furnizorului, nu a clientului — același furnizor pune
aceleași detalii de produs la toți clienții lui (ex. Albeni = cutie de 18
oriunde), deci corecția unui user îi ajută pe toți (decizia fondatoarei,
2026-07-05). Riscul de „otrăvire" din ADR-010 e atenuat, nu eliminat: o valoare
greșită a altcuiva se aplică doar unde userul n-are corecția lui, iar prima lui
corecție îl acoperă permanent (a lui are prioritate). Plafonul 2-500 din
`/api/box-ratio` respinge valorile absurde. Dacă apare abuz real, pasul următor
e consensul (valoarea folosită de ≥2 useri), nu întoarcerea la per-user.

## ADR-023 — Regulile SGR pe categorii legale, în cod
**Data:** 2026-07-05.
**Decizie:** SGR-ul unui produs se decide în straturi: (1) „NAVETA" în denumire → 0;
(2) „SGR" în denumire → 0,50; (3) linia de garanție de pe document, cu aceeași
cantitate → 0,50 pe produsul precedent; (4) **categoria legală din denumire**
(`classifySgr`, HG 1074/2021): băuturi (apă/sucuri/bere/vin/spirtoase/energizante)
în ambalaj 0,1–3L → 0,50; lactate/siropuri/ulei sau peste 3L → 0. Tot acolo:
UM lipsă sau „L"/„ML" (litrajul halucinat ca unitate) → `buc`.
**De ce:** Regulile SGR sunt LEGE, nu alegerea furnizorului — deci pot sta în cod,
determinist. Pe facturile unde produsele nu au „SGR" în denumire și AI-ul ratează
liniile de garanție (poze), produsul rămânea fără SGR deși legea îl cere la raft
(apa are, iaurtul la PET nu are). Documentul rămâne primul semnal; categoria e
plasa de siguranță care nu depinde de calitatea citirii.

## ADR-022 — PDF-ul ANAF citit determinist; garduri de cod peste orice citire AI
**Data:** 2026-07-05.
**Decizie:** (1) PDF-ul oficial ANAF al e-Facturii („RO eFactura", layout național
FIX) se parsează determinist (`parseEfacturaAnafPdf`), ca XML-ul — nu mai trece
prin AI. (2) Garduri deterministe noi în `lib/pricing/scanGuards.ts`, aplicate
peste ORICE citire AI: liniile de garanție/ambalaj SGR se filtrează și în cod
(modelul uneori le scăpa ca produse), iar `reconcileUnitPrice` alege prețul care
satisface `cantitate × preț ≈ valoarea rândului` — acoperind discountul (valoare
deja netă) și separatorul românesc de mii („4.560" = 4560 bucăți). (3) Bugetul de
text pentru PDF-urile de furnizor urcat 5000 → 12000 de caractere: o factură
reală de ~25 de produse are 5500-6500 de caractere, vechea tăietură pierdea coada
facturii fără nicio eroare vizibilă. (4) Dedupe și pe calea PDF, nu doar pe felii.
**De ce:** Testul pe o factură reală în TREI formate (XML + PDF ANAF + PDF-ul
clasic al furnizorului) a arătat: AI-ul citea eronat ambele PDF-uri, iar cele
două formate structurate se pot citi perfect în cod — parserele independente de
XML și PDF ANAF dau rezultate IDENTICE (23/23), verificare încrucișată. Căile
deterministe nu consumă din cota de scanări (nu ating Groq).

## ADR-021 — e-Factura XML se citește determinist în cod, nu de AI
**Data:** 2026-07-05.
**Decizie:** Un fișier XML de e-Factura (UBL / RO_CIUS) se parsează 100% în cod
(`lib/pricing/efactura.ts`), FĂRĂ AI: nume, preț unitar fără TVA, cotă TVA și
cantitate se iau din câmpuri fixe; prețul de bax se împarte pe bucată după „x N"
din denumire; SGR din denumire; liniile de AMBALAJ SGR / garanție se exclud. Se
interceptează în client (`useInvoiceScan`) înainte de calea AI; plasă de siguranță
și în ruta API. Nu consumă din cota de scanări (nu e AI).
**De ce:** Înainte, XML-ul era convertit în text și trimis la modelul AI de text,
dar TRUNCHIAT la 5000 de caractere — o factură densă pierdea majoritatea liniilor,
iar modelul citea greșit structura UBL (ex. Coca-Cola 2.5L raportat 62.12 neîmpărțit,
Monster 1.48 împărțit greșit la cantitate). Sursa fiind structurată, citirea poate
fi deterministă — regula „aritmetica în cod, nu de AI" (ADR-001) dusă la capăt: și
CITIREA e determinist când formatul o permite. Corect, gratuit, instant.

## ADR-020 — Limitele de abonament impuse în DB, comutatorul de lansare în `app_config`
**Data:** 2026-07-04.
**Decizie:** Limitele lunare (fișe/calcule) sunt impuse prin **triggere Postgres** pe
`quotes` și `pricing_usage` (`supabase/enforce-limits.sql`), nu doar în UI. Comutatorul
PRELAUNCH s-a mutat din constanta de cod în tabelul `app_config` (cheia `prelaunch`),
citit și de UI (`lib/plan.ts`, cache 60s) și de triggere.
**De ce:** Verificarea doar în client se ocolea cu un insert direct în Supabase (RLS
verifică doar `user_id`, nu limita) — gaură de monetizare. O singură pârghie în DB evită
și riscul de a stinge lansarea în cod dar nu în DB (sau invers). Cost asumat: limitele
există în două locuri (TS + SQL) — documentat în BUSINESS_RULES cap. 5.

## ADR-019 — Acces gratuit pe viață (lifetime) pentru cei care au ajutat
**Data:** 2026-07-04.
**Decizie:** Coloană `profiles.lifetime` (boolean). Când e `true`, userul primește **Pro
nelimitat pe viață**, fără dată de expirare — `getEffectiveLimits` îl întoarce înaintea
logicii de abonament plătit (dar după PRELAUNCH). Se acordă MANUAL în DB:
`UPDATE profiles SET lifetime = true WHERE ...`.
**De ce:** Câteva persoane care au ajutat proiectul (aici sau în viață) primesc acces full
permanent. Un flag dedicat e mai curat decât o dată de expirare falsă (ex. 2099). În
Setări apare „acces gratuit pe viață".

## ADR-001 — Aritmetica se face în cod, nu de AI
**Decizie:** La scanarea facturilor/bonurilor, modelul AI DOAR citește și transcrie
numerele brute. Toată aritmetica (TVA, cutie/bucată, discount, SGR, raport frate) se
face determinist în cod (`app/api/parse-invoice/route.ts`, `validateAndSanitize`).
**De ce:** Modelele lingvistice greșesc constant la calcul; codul nu. Un preț greșit
distruge încrederea, care e tot produsul. Verificare: `cantitate × preț ≈ valoarea rândului`.

## ADR-002 — Două axe de abonament ținute distincte
**Decizie:** `account_type` (artizan/pro = TVA + firme, mod de lucru) și `plan_tier`
(free/artizan/mercator/pro = ce a plătit) sunt coloane și concepte SEPARATE.
**De ce:** Modul de lucru (vrei TVA?) nu are legătură cu plata. Amestecarea lor ar forța
oameni să plătească pentru TVA sau ar bloca artizanii. „Mercator" e nume de abonament,
nu de modul (modulul e „Calculator Preț").

## ADR-003 — Structură de abonamente pe 4 niveluri, limite per modul
**Decizie:** Free / Artizan / Mercator / Pro, fiecare cu limite lunare diferite pe cele
două module (vezi `docs/PRODUCT.md`). Numărarea e pe lună calendaristică.
**De ce:** Monetizare reală la lansare, adaptată celor două tipuri de utilizatori:
artizanul vrea fișe nelimitate, comerciantul vrea calcule nelimitate — nu-i punem să
plătească pentru ce nu folosesc.
**Origine (context important, nu șterge):** Artizan = ideea fondatoarei. **Mercator a
fost cerut explicit de un contabil** când i s-a povestit de Artizan — deci e cerere
validată din piață, NU se taie. Discuția deschisă e doar **prețul** lui (129 vs Pro 149
— diferența de 20 lei îl face fie necumpărat, fie ancoră intenționată spre Pro). Pasul
următor: întrebat contabilul care l-a cerut ce preț ar accepta clienții lui.

## ADR-004 — TVA + firme multiple gratuite pentru toți
**Decizie:** Regimul cu TVA și firmele multiple NU se monetizează; sunt libere pe orice cont.
**De ce:** Sunt nevoi de bază, nu funcții premium. Monetizăm volumul (fișe/calcule), nu
capacitatea legală de a lucra corect.

## ADR-005 — Free e podeaua permanentă; freemium 30 de zile
**Decizie:** Primele 30 de zile un cont nou primește 30 fișe + 30 calcule, apoi cade pe
Free (3+3). Nimeni nu rămâne blocat complet.
**De ce:** Perioadă generoasă de probă fără să existe „ziduri" care alungă userul.
Consecință: `/trial-expired` devine cod mort (îl păstrăm, scoatem rutarea).

## ADR-006 — Flag global PRELAUNCH
**Decizie:** Cât `PRELAUNCH = true` (`lib/plan.ts`), oricine e tratat ca Pro (nelimitat).
Se stinge manual la lansare.
**De ce:** Testarea în pre-lansare nu trebuie blocată de limite. Activarea plăților e
oricum manuală până la un procesator de plăți.

## ADR-007 — Sistemul vechi de „trial pe durată" a fost înlocuit complet
**Decizie:** Am eliminat trial-ul de 30/180 zile („primii 57" + countdown). Infrastructura
de numărare a userilor s-a repurpozat pentru „primii 50 la preț redus" (`PROMO_CAP = 50`).
**De ce:** Noua structură pe niveluri acoperă mai bine monetizarea; trial-ul pe durată
devenea confuz alături de Free permanent.

## ADR-008 — Regim neplătitor de TVA: TVA-ul furnizorului intră în cost
**Decizie:** La neplătitor (`vatPayer=false`), TVA-ul plătit furnizorului e cost
irecuperabil (intră în prețul de intrare), iar clientului NU i se adaugă TVA
(`lib/pricing/calc.ts`).
**De ce:** Corect contabil. Confirmat pe un export real (Bio To Go). Cotele actuale sunt
**11% și 21%** (nu 9/19 — alea sunt pre-2024).

## ADR-009 — Cutie/bucată din coloana UM; raport împrumutat de la „frate"
**Decizie:** Decizia „se împarte pe bucată?" se ia din coloana **UM** a rândului (determinist),
nu din text. Un produs-cutie fără raport în denumire împrumută raportul de la alt
produs-cutie cu același preț de cutie + aceleași prime 3 cuvinte.
**De ce:** Furnizorii nu scriu raportul pe fiecare rând; regula generală bate exemplele
punctuale (nu putem încărca toate formatele posibile).

## ADR-010 — Corecțiile manuale de raport sunt per-user, nu partajate — ÎNLOCUIT de ADR-024
**Decizie:** Butonul „Corectează cutie/bucată" salvează în `product_box_ratios` cu
`created_by`; se aplică doar la scanările ACELUI user. `getKnownRatios` e filtrat pe `created_by`.
**De ce:** Denumirile diferă între furnizori/useri; partajarea ar „otrăvi" prețurile altora.

## ADR-011 — Numerotarea fișelor: max(secvență)+1, nu count+1
**Decizie:** Numărul fișei = `max(secvența existentă în scope luna asta) + 1`
(`lib/quoteNumber.ts`).
**De ce:** `count+1` scade la ștergere și ar reproduce un număr deja folosit (duplicat).

## ADR-012 — SGR tratat ca linie separată, exclus din bază
**Decizie:** SGR = 0,50 lei fix/ambalaj, afișat separat, NU intră în baza de adaos/TVA.
Liniile „GARANTIE PET/STICLĂ/DOZĂ" etc. sunt SGR, nu produse. „NAVETĂ" în denumire → sgr=0.
**De ce:** Cerință legală; e o garanție returnabilă, nu preț de produs.

## ADR-013 — Auth cu cheia anon pentru getUser; service-role doar la scrieri RLS-bypass
**Decizie:** `auth.getUser(token)` se face cu clientul pe cheie **anon** (`lib/apiAuth.ts`,
`verifyBearer`). Service-role se folosește DOAR pentru scrieri care trebuie să ocolească
RLS (raport cutie, api_usage, ștergere cont).
**De ce:** Folosirea service-role la getUser e un bug cunoscut (validare greșită a tokenului).

## ADR-014 — Rate-limit propriu per user + limită de mărime la upload
**Decizie:** 50 scanări/zi (`invoice_scan_logs`), 300/zi pe transcribe/parse-* (`api_usage`,
`lib/rateLimit.ts`, fail-open). Upload respins peste 15 MB.
**De ce:** Protejează cota Groq (plan gratuit) și serverul de fișiere uriașe/abuz.

## ADR-015 — Prompt slab intenționat pe Groq gratuit
**Decizie:** Promptul de scanare a fost slăbit (~5k → ~1.4k tokeni) și max_tokens reduse.
**De ce:** Plan Groq gratuit (limite pe minut și pe zi). 3-4 produse ușor eronate pe o
factură de 41 dintr-o poză de WhatsApp e acceptabil pentru început; corectitudinea totală
vine cu Groq Dev tier (când apar bani). Vezi ROADMAP.

## ADR-016 — Paletă navy + verde smarald
**Decizie:** Albastru → **Navy #002B5B**, portocaliu + auriu/amber → **Verde Smarald #2D6A4F**,
fundal gri foarte deschis. Remapat central în `app/globals.css` (variabile de temă Tailwind v4).
**De ce:** Identitate coerentă, fără să atingem 100+ clase din UI. Ambele nuanțe calde au
mers pe verde (decizia userului), pentru o paletă unitară.

## ADR-017 — Logo: balanță (T) cu papirus + abac
**Decizie:** Logo-ul e o **balanță** în formă de T, cu un **papirus** (stânga) și un **abac**
(dreapta) în echilibru, pe navy rotunjit. Design realizat de utilizator (`public/logo.svg`);
generat în toate dimensiunile (icon/favicon/apple-touch) și afișat în app (landing/login/dashboard).
**De ce:** Balanța = corectitudine/echilibru; papirus + abac = document + calcul. Fiind
desenat de utilizator, dreptul de autor e clar al ei (protejabil ca marcă la OSIM).

## ADR-018 — Documentația în `docs/`, nu în istoricul conversațiilor
**Decizie:** `docs/` cu VISION / PRODUCT / DECISIONS / ROADMAP. FĂRĂ `docs/CLAUDE.md`
(cel din rădăcină e singurul încărcat automat de Claude Code).
**De ce:** Deciziile luate în chat se pierd; un loc fix le păstrează. Acest fișier e
exact soluția.

## ADR-025 — Aritmetica de bani se face in bani intregi, nu in lei zecimali
**Decizie:** Rotunjirea (`applyRounding`) si totalurile fiselor (`computeQuoteTotals`) lucreaza
pe intregi (bani), nu pe `number` in lei.
**De ce:** Pasii 0.10 si 1.00 nu sunt reprezentabili exact in binar. `Math.round(12.35 / 0.1) * 0.1`
da 12.30, nu 12.40 — eroare pe **698 din 20.000** de preturi testate (3,5%), mereu in JOS, deci
comerciantul pierde de fiecare data. `fmt2()` masca problema la afisare, deci nu arata niciodata
ca un bug numeric, ci ca o rotunjire nedreapta si inexplicabila.

## ADR-026 — Plafoane pe intrari, in `lib/`, nu in atribute HTML
**Decizie:** Discount `0..100%` (sau cel mult subtotalul, in lei), adaos `0..1000%`, pret si SGR
`>= 0` — plafonate in `lib/pricing/calc.ts` si `lib/quotes/totals.ts`.
**De ce:** `min`/`max` pe `<input type=number>` NU se aplica: inputurile nu sunt intr-un `<form>`,
deci validarea nativa nu ruleaza. Un discount de 150% producea pret, TVA si TOTAL negative pe
PDF-ul trimis beneficiarului.

## ADR-027 — Un singur loc care calculeaza totalurile unei fise
**Decizie:** `lib/quotes/totals.ts` (`computeQuoteTotals`) e unica sursa; `app/quotes/[id]` doar
o apeleaza, inclusiv la scriere (`persistTotals`).
**De ce:** Formula era copiata identic de CINCI ori in acelasi fisier si incepuse sa divergheze —
caile de scriere foloseau `emitent.vat_rate`, randarea si PDF-ul `quote.vat_rate`. Orice regula
fiscala noua trebuia aplicata in cinci locuri.

## ADR-028 — PDF-ul se genereaza din date PERSISTATE, nu din state-ul de formular
**Decizie:** Butoanele PDF/WhatsApp folosesc `savedDiscount`; cat exista modificari nesalvate,
cer intai salvarea.
**De ce:** Utilizatorul tasta un discount si apasa direct "Trimite" — documentul ajuns la client
continea o valoare pe care `quotes.total` n-o avea. Evidenta interna si documentul nu se potriveau,
fara nicio urma a divergentei.

## ADR-029 — Restrictiile pe COLOANE se fac cu granturi, nu cu RLS
**Decizie:** `supabase/lock-billing-columns.sql` retrage `update` global pe `profiles` si il
reacorda explicit doar pe coloanele editabile din aplicatie.
**De ce:** RLS raspunde la "ce RANDURI vezi", nu la "ce COLOANE poti scrie". Politica `profiles_own`
(la nivel de rand) permitea oricui sa-si seteze `plan_tier`/`lifetime` — iar ambele straturi de
limitare, si `lib/plan.ts` si triggerul din DB, citesc exact acele coloane. Consecinta secundara
dorita: orice coloana noua pe `profiles` e implicit NEscriibila (fail-closed).

## ADR-030 — Interogarile sub RLS din rutele API cer un client cu tokenul userului
**Decizie:** In rutele API, `auth.getUser(token)` se face cu clientul anon (ADR-013 ramane valabil),
dar orice `.from(...)` care depinde de `auth.uid()` foloseste un client separat construit cu
`global.headers.Authorization`.
**De ce:** `getUser(jwt)` doar VALIDEAZA tokenul printr-un apel la `/auth/v1/user` — nu il ataseaza
clientului. Verificat empiric: interogarile ulterioare plecau ca rol `anon`. In `parse-invoice`
asta insemna ca limita de 50 scanari/zi nu se declansa NICIODATA si `invoice_scan_logs` ramanea gol.
ADR-013 spunea corect ce sa NU faci; nu spunea ce sa faci in loc.

## ADR-031 — La modificarea vocala, modelul intoarce OPERATIA, nu starea
**Decizie:** `/api/edit-quote` primeste de la model actiuni (`add` / `set` / `remove` / `clear`)
cu eticheta si cantitatea, iar aplicarea peste lista curenta se face determinist in cod
(`lib/services/editActions.ts`). Lista existenta NU mai trece prin model.
**De ce:** Cerandu-i modelului lista completa rezultata, el trebuia sa re-transcrie corect fiecare
linie la fiecare comanda. Pe "mai adauga doua prize" intorcea doar priza, iar lista se inlocuia cu
ea — restul lucrarilor dispareau (bug reprodus pe un caz real). Nu e o problema de formulare a
promptului: instructiunea explicita "intoarce lista COMPLETA" nu a fost respectata. Un model care
re-scrie 8 linii ca sa adauge una are 8 ocazii sa greseasca; unul care spune "adauga priza x2" are
una. E acelasi principiu ca la scanare (AI-ul citeste, codul calculeaza) si ca la ADR-020
(matchService): modelul face partea de LIMBAJ, codul face partea de STARE.
**Consecinta:** o lucrare poate disparea din fisa DOAR daca s-a cerut explicit stergerea ei.

## ADR-032 — Fisa se editeaza si MANUAL, nu doar prin dictare
**Decizie:** In previzualizarea din `/quick`, fiecare lucrare are −/+ si camp de cantitate,
buton de stergere, plus un select de adaugare din serviciile salvate. Dictarea ramane calea
principala; mana e calea de corectie. Ambele lucreaza pe aceeasi stare (`preview`), deci o
corectie manuala e vizibila si pentru urmatoarea comanda vocala.
**De ce:** Whisper confunda in romana "doua" cu "noua" (rimeaza). Cand transcrierea greseste,
o atingere pe cifra e instantanee si 100% sigura, fara alt drum la model — iar corectia prin
dictare mai are o sansa sa fie inteleasa gresit. Vocea pentru viteza, mana pentru certitudine.
Plafoanele de cantitate sunt aceleasi ca pe server (1..100.000), ca cele doua cai sa nu diveargheze.
**Corolar:** transcriptul ramane afisat ("Am auzit: ...") dupa procesare. Daca dispare, omul vede
doar cantitatea gresita si nu poate sti daca a gresit el, microfonul sau modelul.

## ADR-033 — Gardurile de scanare RAPORTEAZA ce exclud, nu sterg tacut
**Decizie:** `isNonProductLine` si `phantomRowIndexes` raman, dar fiecare rand scos e intors
clientului in `excluded: [{name, reason}]` si afisat in `/pricing`. In plus, `isNonProductLine`
nu mai exclude pe baza cuvintelor AMBIGUE decat cand linia arata a depozit (scurta, generica,
fara cifre); `returnare` singur nu mai exclude nimic.
**De ce:** Sunt euristici pe denumire, deci GRESESC. Un comerciant de ambalaje/paleti isi vedea
tot catalogul disparand, iar `RETURNARE MARFA` (storno real) era tratat ca garantie. Randurile
lipsa nu se pot observa — omul nu vede ce nu i s-a aratat. Un gard care greseste e acceptabil
daca spune ce a facut; unul care greseste in tacere, nu. Acelasi principiu ca la `unmatched`
din fisele vocale (ADR-020).

## ADR-034 — Modelele Groq sunt configurabile din mediu, iar "model scos din uz" e o eroare de sine statatoare
**Decizie:** `GROQ_VISION_MODEL` / `GROQ_TEXT_MODEL` cu valori implicite in cod. `callGroq`
recunoaste raspunsurile de tip "model inexistent/decomisionat" si le propaga ca `groq_model_gone`,
cu mesaj propriu in UI.
**De ce:** Groq a oprit `llama-4-scout-17b-16e-instruct` pe 17.06.2026. Scanarea pozelor a murit
in aceeasi zi, dar simptomul raportat a fost "poza neclara" — pentru ca in calea pozelor ORICE
eroare neprevazuta cadea in ramura implicita, care da vina pe poza. Utilizatorul a refotografiat
la nesfarsit o factura perfect lizibila. Doua concluzii, ambele aplicate: (1) o dependenta externa
care se poate schimba peste noapte trebuie sa fie o variabila, nu o constanta ingropata;
(2) un mesaj de eroare implicit NU are voie sa fie o CONCLUZIE despre cauza ("poza e neclara") —
concluziile se spun doar cand sunt sustinute; restul se raporteaza ca necunoscut, cu detaliu.

## ADR-035 — Poza = sursa de text; OCR local ca rezerva fara furnizor
**Decizie:** Calea pozelor devine "obtine text din imagine, prin ce mijloc e disponibil":
model de vedere daca exista, altfel **OCR local in browser** (Tesseract.js, fisiere gazduite in
`public/tesseract/`). Textul intra apoi in exact acelasi flux ca PDF-urile.
**De ce:** Scanarea din poza depindea integral de un model de vedere la un furnizor extern. Cand
acesta a disparut de pe planul gratuit (iulie 2026), functia-vedeta a produsului a murit complet
si nu mai exista NICIO alternativa — nici macar una mai slaba. OCR-ul local ruleaza pe telefonul
utilizatorului: fara cheie, fara cota, fara cost, imposibil de depreciat de altcineva. Fisierele
sunt gazduite local pentru ca CSP-ul are `connect-src 'self'` (un CDN ar fi blocat) si pentru ca
asa merge si offline.
**Compromis asumat:** OCR-ul e mai slab decat un model de vedere pe poze strambe sau prost
luminate. Acceptat constient: "merge mai slab" bate "nu merge deloc", iar cand un model de vedere
E disponibil, el are prioritate. Cost: ~5 MB de fisiere statice, descarcate o singura data pe
dispozitiv.
**Principiu general:** orice functie-cheie care depinde de un singur furnizor extern are nevoie de
o cale de rezerva care NU depinde de el. Altfel produsul are un intrerupator pe care il tine
altcineva.

## ADR-036 — Furnizorul de AI e o variabila, nu o constanta in cod
**Decizie:** `VISION_API_BASE` / `VISION_API_KEY` si `TEXT_API_BASE` / `TEXT_API_KEY`, implicit
Groq. Vederea si textul se pot duce la furnizori diferiti.
**De ce:** Groq expune API-ul in formatul OpenAI (`/chat/completions`, `messages` cu `image_url`),
deci codul functiona deja cu orice furnizor compatibil — doar URL-ul si cheia erau ingropate in
cod. Cand Groq a rupt calea pozelor, singura solutie parea "scrie un adaptor nou"; in realitate
erau doua variabile. Consecinta practica: se poate lasa TEXTUL pe un plan gratuit si plati DOAR
vederea, care e partea scumpa si greu de inlocuit.
**Ordinea de preferinta pe poze ramane:** furnizor de vedere (daca e configurat) -> OCR local
(ADR-035). Nicio cale nu depinde de un singur furnizor.

## ADR-037 — Randurile respinse de filtrul numeric si preturile-zero se RAPORTEAZA
**Decizie:** Extins `excluded` cu al treilea motiv, `neclar`: (1) un rand cu nume de produs dar
fara niciun pret/cantitate valid extras (filtrul numeric din `validateAndSanitize` il respingea
tacut); (2) un produs al carui pret CALCULAT (dupa cutie/bucata, discount, TVA) rotunjeste la 0.
**De ce:** Raportat direct: scanare OCR cu 35 din 41 de produse gasite, doua cu 0 lei — si nicio
cale sa se vada ce s-a intamplat cu restul de 6. `excluded` acoperea deja garantiile (ADR-033) si
duplicatele-fantoma, dar rata cea mai probabila sursa de pierdere pe text OCR (zgomotos, cifre des
mazgalite): randuri respinse de validarea numerica de baza. Un pret 0 e in plus imposibil legitim
— liniile PROMO/gratuite sunt deja excluse de model — deci orice 0 e un artefact de calcul (cantitate
citita gresit, raport bucati/cutie mostenit gresit de la un "produs frate"), nu un produs real.
**Principiu, acelasi ca la ADR-033/H4/H9:** o decizie automata care poate ascunde munca sau banii
utilizatorului trebuie SA SE VADA, chiar si atunci cand codul e sigur ca a decis corect.

## ADR-038 — Doua garduri pe reconcilierea pretului unitar
**Decizie:** In `reconcileUnitPrice`: (1) invariant absolut — la cantitate >= 1, pretul unitar nu
poate depasi valoarea randului; (2) regula de "separator de mii" (x1000) se aplica DOAR cand
cantitatea are zecimale.
**De ce:** Caz real, diagnosticat pe textul OCR trimis de utilizator. Pe o factura cu preturile
BIFATE CU PIXUL, OCR-ul citea creionul peste cifre: "40.42" => "40473". Coloana Valoare ramanea
curata, deci pretul se putea recupera din `valoare/cantitate` — si asa se intampla pe 10 din 11
randuri. Pe al 11-lea, gunoiul 40473 cadea din intamplare la 0,13% de `40.42 x 1000`, deci regula
de separator de mii il "salva" ca fiind corect. Efect in lant: produsul URMATOR imprumuta raportul
bucati/cutie de la "fratele" cu acelasi pret, nu-l mai gasea (pretul fratelui fiind gunoi) si iesea
si el gresit. Un singur rand stricat strica doua produse.
**Principiu:** un invariant care nu poate fi incalcat de date reale (pret unitar <= valoare rand)
bate orice euristica de salvare. Euristicile se aplica DUPA ce invariantii au trecut, nu inaintea lor.

## ADR-039 — Tabelul de factura se parseaza in cod, nu de model
**Decizie:** `parseInvoiceTableText` ruleaza INAINTEA modelului pe orice text de factura (OCR sau
PDF). Ancora: cota TVA + UM. Verificare incrucisata: `valoare x cota ≈ TVA_lei`, apoi
`pret = valoare / cantitate`. Daca gaseste >= 3 randuri verificabile, modelul nu mai e chemat.
**De ce:** Pe text OCR, extragerea prin model dadea rezultate ALEATOARE — aceeasi poza, aceeasi
factura, o data 25 de produse, alta data 31, alta data 35. OCR-ul e determinist, deci variatia
venea din model: pus sa transcrie 41 de randuri de tabel, sarea randuri diferite la fiecare
rulare. Nicio ajustare de prompt nu repara asta, pentru ca problema nu e formularea — **un model
nu e un parser**. Pe factura reala testata: 38/38 randuri, toate preturile corecte, identic la
fiecare rulare.
**Beneficiu secundar:** verificarea cu coloana de TVA repara erori pe care modelul nu le putea
repara — pe randul unde OCR-ul pierduse virgula din valoare ("80.84" => "8084"), TVA-ul (16.98)
o reconstituie.
**Extinde principiul ADR-035 / e-Factura:** cand sursa are structura, se citeste in cod. Modelul
ramane pentru ce chiar nu are structura — layout-uri necunoscute, bonuri, formate noi.

## ADR-040 — Consimtamintele se PASTREAZA, in doua locuri
**Decizie:** La inregistrare, cele patru acorduri (Termeni, GDPR, Retragere, Marketing) se scriu
(1) in `auth.users.raw_user_meta_data`, odata cu userul, si (2) in tabelul `consents`, forma
interogabila. Fiecare consimtamant e legat de o VERSIUNE a documentelor (`CONSENT_VERSION`).
**De ce:** Bifele erau validate in browser si apoi aruncate. GDPR Art. 7(1) cere operatorului sa
poata DEMONSTRA consimtamantul — nu exista nicaieri cine, ce, cand, pe ce versiune. Iar acordul de
marketing, singurul opt-in real, se pierdea complet: nu putea fi nici folosit, nici respectat la
dezabonare.
**De ce in DOUA locuri:** la inregistrarea cu confirmare pe email NU exista sesiune, deci nu se
poate scrie in niciun tabel cu RLS. Metadata se scrie odata cu userul, deci dovada exista chiar
daca omul nu-si confirma niciodata emailul. Tabelul se completeaza la prima autentificare
(`upsert`, deci idempotent) si serveste interogarilor ("cine a acceptat marketing?").
**Userul nu poate STERGE sau MODIFICA un consimtamant** (fara politici de update/delete): o dovada
pe care subiectul o poate rescrie nu mai e dovada. Retragerea se inregistreaza ca rand NOU cu
`accepted = false`.
**Ramane de facut:** utilizatorii inregistrati INAINTE de aceasta schimbare nu au dovada, si ea nu
se poate reconstitui retroactiv — ar fi o falsificare. Li se va cere acordul din nou, la prima
autentificare (vezi ROADMAP). Pana atunci, absenta lor din tabel e informatia corecta.

## ADR-041 — IP-ul de throttling se ia din coada lantului, nu din cap
**Decizie:** `clientIp` prefera headerele platformei (`x-vercel-forwarded-for`, `x-real-ip`), iar
din `x-forwarded-for` ia ULTIMA valoare, nu prima.
**De ce:** `x-forwarded-for` e un lant in care valoarea din STANGA vine de la client. Luand-o pe
aceea, oricine trimitea `X-Forwarded-For: <aleator>` primea o identitate noua la fiecare cerere si
ocolea complet plafonul zilnic — adica singura aparare a rutelor publice, pre-autentificare, nu
exista. Ultima valoare e cea adaugata de proxy-ul cel mai apropiat de noi, singura pe care clientul
nu o poate falsifica.

## ADR-042 — Plafon si pe scrierea in tabelul partajat de raporturi cutie/bucata
**Decizie:** `/api/box-ratio` primeste `allowDaily(userId, 'box-ratio', 30)`.
**De ce:** Era singura ruta care scrie intr-un tabel PARTAJAT intre toti utilizatorii (ADR-024) si
singura ramasa fara plafon. Un cont putea insera oricate raporturi gresite, iar ele se aplicau
automat la scanarile tuturor clientilor aceluiasi furnizor. 30/zi acopera lejer corectiile reale
ale unui comerciant; peste, e abuz.

## ADR-043 — Stergerile ireversibile se confirma, iar butoanele spun ce fac
**Decizie:** Toate stergerile care ating baza de date trec prin `confirmDelete()` din
`lib/confirm.ts`, iar butoanele "×" din liste au `aria-label` care numeste actiunea SI randul
("Sterge fisa Renovare baie"), nu "Inchide".
**De ce:** Butoanele de stergere din fise, clienti, servicii, calcule si linii de fisa stergeau pe
loc, la o singura atingere, fara intrebare si fara anulare. Aplicatia se foloseste pe telefon, unde
"×" e la cativa pixeli de pretul randului si de zona de scroll — o atingere gresita stergea o fisa
finalizata cu tot cu liniile ei, definitiv.
**Al doilea defect, in acelasi loc:** toate aceste butoane erau anuntate `aria-label="Inchide"`.
Cine navigheaza cu cititor de ecran auzea "Inchide", apasa ca sa inchida ceva — si stergea. Cu mai
multe randuri identice pe ecran, nici nu putea sti pe care.
**Ce NU s-a schimbat:** butoanele care scot un rand din lista LOCALA, nesalvata (rand nou de fisa,
produs scanat inainte de import) raman fara confirmare — nu se pierde nimic persistat.
**Garda:** `lib/confirm.test.ts` citeste paginile cu stergeri si pica daca vreuna scapa de
`confirmDelete` sau daca un buton care sterge se numeste iar "Inchide".

## ADR-044 — Mesajele brute de eroare nu ajung in browser
**Decizie:** Rutele API intorc un mesaj scris de noi si logheaza exceptia pe server
(`console.error`). Exceptie deliberata: cele trei coduri Groq (`groq_rate_limit`, `groq_too_large`,
`groq_model_gone`) trimit mai departe mesajul FURNIZORULUI, taiat la 300 de caractere.
**De ce:** `error.message` de la Postgres numeste tabelul, coloanele si constrangerile — harta
schemei, oferita oricui are un cont. Un `fetch` esuat da hostname-uri interne si proxy-uri; un
`TypeError` da calea fisierului de pe server. Ramura generica de la `/api/parse-invoice` trimitea
ORICE exceptie neasteptata direct in UI.
**De ce Groq face exceptie:** mesajul lui ("mai incearca in 4,6s") e singurul lucru care ii spune
omului ce sa faca, iar utilizatorul nu are acces la logurile serverului. Nu e o eroare a noastra si
nu descrie sistemul nostru.

## ADR-045 — Indexuri pe coloanele dupa care se filtreaza (supabase/indexes.sql)
**Decizie:** Index pe `(user_id, created_at)` la tabelele de consum si liste, pe `quote_items
(quote_id)`, si un index pg_trgm pe `product_box_ratios (supplier_name)`.
**De ce:** Tabelele aveau doar cheia primara. Costul unei interogari fara index creste cu numarul
TOTAL de randuri din tabel, nu cu cate are userul — deci cu cat aplicatia ar avea mai multi clienti,
cu atat ar fi mai lenta pentru FIECARE, inclusiv pentru cel abia inscris. Tabelele partajate
(`api_usage`, `invoice_scan_logs`, `product_box_ratios`) sunt cele mai expuse: se scrie in ele la
fiecare apel.
**De ce ACUM, cand nu se simte:** pe un tabel mic crearea e instantanee si nu blocheaza nimic; pe
unul deja mare `create index` tine lacatul si opreste scrierile.
**De ce pg_trgm la furnizori:** interogarea e `ilike`, iar un B-tree obisnuit nu poate fi folosit de
`ilike` (ordinea lui e sensibila la majuscule). pg_trgm indexeaza trigrame, pe care planificatorul
le poate folosi.
**Ce NU rezolva:** `/api/check-signup` si `/api/admin/lifetime` parcurg `auth.users` prin
`listUsers()`, nu tabelul `profiles` — niciun index nu le ajuta, e nevoie de schimbare de cod
(ROADMAP).

## ADR-046 — Numarul de fisa se reincearca la coliziune
**Decizie:** Ambele locuri care creeaza fise (`/quotes`, `/quick`) trec prin
`insertQuoteWithNumber()`. La eroare de unicitate se reciteste maximul si se incearca din nou,
de trei ori. Orice ALTA eroare se intoarce imediat.
**De ce:** `nextQuoteNumber` citeste maximul, apoi se scrie — intre cele doua momente o a doua
creare (alt tab, alt telefon pe acelasi cont) poate lua acelasi numar. Indexul unic din
`enforce-limits.sql` opreste dublura, dar pana acum ea ajungea la om ca mesaj de baza de date, cu
fisa nesalvata. Acum coliziunea e invizibila.
**De ce NU se reincearca la alte erori:** ar ascunde cauza reala (RLS, coloana lipsa, retea) si ar
face trei cereri degeaba.
**Depinde de:** indexul unic `quotes_unique_number`. Fara el nu apare nicio eroare si se salveaza
doua fise cu acelasi numar — pe un document dat clientului, exact ce nu vrem. Deci
`supabase/enforce-limits.sql` ramane obligatoriu inainte de lansare.

## ADR-047 — Fail-open ramane, dar nu mai e tacut
**Decizie:** Fiecare loc care lasa o cerere sa treaca fara plafon (cheie de service-role lipsa,
eroare de citire a contorului, exceptie, IP nedeterminabil) scrie in logurile serverului.
`warnOnce` per cauza, ca sa se poata gasi fara sa inunde logul.
**De ce fail-open ramane:** contoarele sunt aparare anti-abuz, nu poarta critica; un hopa de retea
nu are voie sa blocheze un utilizator care plateste.
**De ce tacut era o capcana:** o singura variabila de mediu lipsa oprea TOATE plafoanele din
aplicatie deodata, si nimic nu semnala asta — sistemul parea sanatos in timp ce singura aparare
impotriva abuzului nu mai exista. La fel, eroarea de CITIRE a contorului era inghitita: `count`
ramanea `undefined`, `?? 0` il facea sa arate ca "zero folosiri azi", si limita nu se mai atingea
niciodata.

## ADR-048 — Vitest stie aliasul `@/`
**Decizie:** `vitest.config.ts` mapeaza `@` la radacina proiectului.
**De ce:** Vitest nu citeste `paths` din `tsconfig.json`. Fara alias, orice fisier care importa
`@/lib/...` nu putea fi testat DELOC — testul cadea la incarcare, nu la o asertiune. Efectul
secundar era mai subtil decat inconvenientul: ajungea sa fie acoperit cu teste doar codul fara
importuri interne, adica exact codul deja cel mai izolat si cel mai putin riscant.

## ADR-049 — Ce s-a decis sa NU se schimbe (limite acceptate constient)
**`allowDaily` are o fereastra de cursa (TOCTOU).** Numara, apoi insereaza; doua cereri simultane
pot vedea amandoua "sub limita". Nu se repara: costul maxim e un apel gratuit in plus, iar conturile
sunt folosite de un singur operator. Repararea corecta cere o functie atomica in baza de date, deci
inca un fisier SQL de rulat si o schimbare pe calea critica a fiecarui apel AI — disproportionat
fata de ce se castiga.
**Service worker-ul nu expira intrarile din cache.** Strategia e network-first: cache-ul se
foloseste doar cand reteaua cade, iar `CACHE = 'tarifator-vN'` sterge tot la fiecare versiune noua.
Un mecanism de expirare peste asta ar adauga cod pe calea prin care ajunge FIECARE fisier la
utilizator, ca sa rezolve un caz pe care bump-ul de versiune il acopera deja.
**Nu exista jurnal de audit pe documentele finalizate.** Ramane in ROADMAP ca idee, nu ca defect
de reparat acum: e o functionalitate de produs (cine, ce, cand a modificat), nu un patch — cere
tabel, UI si o decizie despre cat se pastreaza.

## ADR-050 — Curatenie: context.md sters, README real, domeniul intr-un singur loc
**`context.md` s-a STERS.** Continea informatii false care se contraziceau cu `BUSINESS_RULES.md`:
"TVA: doar 0% si 21%" (real: 11 si 21), "Numar document: TS-YYYYMM-NNN" (real: DR-), tipul de cont
"meseriasi" (real: artizan), Next.js 15 (real: 16), un singur model Groq fix (real: liste
configurabile). Un fisier de context gresit e mai rau decat lipsa lui: urmatoarea sesiune il citeste
si construieste pe el. Sursa de adevar ramane `BUSINESS_RULES.md` + `docs/`.
**README-ul** era sablonul `create-next-app`. Acum spune ce e aplicatia, ce variabile de mediu ii
trebuie si — cel mai important — CARE fisiere SQL din `supabase/` trebuie rulate manual. Erau
imprastiate prin ADR-uri si prin ROADMAP; cine clona repo-ul nu avea de unde sa stie.
**Domeniul public** era scris de mana in sase fisiere (sitemap, robots, canonical, Open Graph,
Termeni). Acum e in `lib/site.ts`, cu suprascriere din `NEXT_PUBLIC_SITE_URL`. La o mutare de
domeniu se schimbau unele si se uitau altele, iar rezultatul nu e o eroare vizibila: sitemap-ul
trimite motoarele la adrese moarte si `canonical` le cere sa indexeze o pagina inexistenta. Nimic
nu cade, doar dispari din cautari.
**Dependinte scoase:** `@supabase/auth-helpers-nextjs` (pachet declarat depasit de Supabase) si
`@supabase/ssr` — niciuna importata nicaieri. Build verificat dupa scoatere.

## ADR-051 — CI ruleaza aceeasi versiune de Node ca masina de lucru (22)
**Decizie:** Versiunea de Node e declarata o singura data, in `devizrapid/.nvmrc`; CI o citeste de
acolo (`node-version-file`), iar `package.json` o repeta ca `engines`.
**De ce:** CI era pe Node 20, dezvoltarea pe 22. `@supabase/realtime-js` are nevoie de `WebSocket`
NATIV, aparut in Node 22 — sub el, `lib/supabase.ts` arunca la IMPORT. Efectul: primul test al unui
fisier care importa clientul Supabase (`lib/quoteNumber.test.ts`) a picat **doar in CI**, fara sa
ruleze nicio asertiune, dupa ce local trecuse.
**Ce era de fapt stricat:** nu testul, ci increderea in semnal. Cand CI ruleaza alt Node decat
masina pe care se scrie codul, "verde local" nu mai prezice nimic si esecurile apar abia dupa push.
**De ce citit din fisier, nu scris in workflow:** trei locuri cu aceeasi versiune scrisa de mana
diverg; unul singur, citit de restul, nu poate.

## ADR-052 — Raportul cutie/bucata se citeste si din "24BUC/CUT", nu doar din "x 24"
**Decizie:** `piecesPerBox` recunoaste marcatorul `BUC`/`BC`/`B` dupa numar (`24BUC/CUT`, `30B/CUT`,
`35 GR 24 BUC`, `/17 B`) si paranteza de la finalul unei denumiri taiate de OCR (`...GLZ (18` => 18),
pe langa formele de bax de dinainte. Pe calea parserului determinist, `getKnownRatios` fara furnizor
aplica acum corectiile PROPRII ale utilizatorului in loc sa intoarca o harta goala.
**De ce:** Pe o factura reala, TOATE cele 12 produse la cutie ieseau cu raportul 1 — pretul CUTIEI
era vandut ca pret de BUCATA. Un macaron de ~2,65 lei se afisa la 64 lei/buc, o cutie de napolitane
la 97 lei/buc. `isBoxUnit` era corect (UM=Cut), dar `priceExVat / 1` nu imparte nimic; iar unitatea
afisata devenea "buc", deci in UI aratau ca preturi de bucata plauzibile ca forma si absurde ca
valoare.
**Regula exista deja scrisa in DOUA locuri** — `BUSINESS_RULES.md` cap. 7 ("24BUC/CUT" => 24) si
promptul din `/api/parse-invoice` — dar codul determinist nu o implementase niciodata. Furnizorii de
dulciuri/snacks/tigari nu scriu "x 24"; asta stia functia.
**Ce tine gramajul afara:** marcatorul trebuie urmat de spatiu, `/` sau capat de sir (`(?![a-z])`).
Fara asta "35GR BANOFFEE" ar da 35 si "COLA 2 BAX" ar da 2. Zece teste de regresie pe denumiri reale
pazesc exact asta, plus cele sapte dimensionale de dinainte (tabla, OSB, folie raman la 1).
**De ce corectiile ALTORA nu se aplica fara furnizor:** ADR-024 imparte corectiile tocmai pe
furnizor. Fara el nu se poate sti daca "cutie de 24" e acelasi ambalaj sau alt producator cu produs
omonim. Ale tale sunt ale tale oricum — de asta se aplica.
**Ce NU rezolva:** cutiile la GRAMAJ ("JUMBO 1.3 KG", "TADU 450 GR") nu au raport in denumire si nu
se poate deduce onest cate bucati contin. Raman la 1 si asteapta regula "frate" sau corectia
manuala — care de acum chiar se aplica.
**Rezultat pe factura reala:** 9 din 12 corecte direct din denumire, a 10-a prin regula "frate"
(MAGURA MACARON CAPPUCCINO imprumuta 24 de la BANOFFEE), 3 cutii la gramaj raman de corectat manual.

## ADR-053 — "x 24" si "36 BUC" sunt doua notatii diferite, deci doua functii
**Decizie:** `piecesPerBox` citeste DOAR configuratia de bax (`x 6`, `1X24`, `0.33L X 12`).
`boxRatioFromName` citeste raportul de ambalare (`24BUC/CUT`, `30B/CUT`, `35 GR 24 BUC`, `(18`) si
cade pe `piecesPerBox` la final. Calea de scanare foloseste `boxRatioFromName` (gata gatuita de
`isBoxUnit`), calea de e-Factura foloseste `piecesPerBox`.
**De ce (regresie proprie, prinsa la timp):** ADR-052 pusese ambele tipare in aceeasi functie. Dar
`buildItem` din e-Factura imparte TOCMAI cand UM=buc — fiindca acolo codurile de ambalaj (XBX=cutie,
XCS=bax) sunt colapsate toate la "buc", iar singurul semnal ramas e notatia din denumire. Cu
tiparele de ambalare inauntru, orice ciocolata cu numarul de bucati in nume se imparte desi factura
o vinde la bucata: "CIOCROM CEL DUBLU 50 GR 36 BUC" la 2,23 lei/buc ar fi devenit 0,06, iar gardul
de pret (`>= 0.05`) nu l-ar fi prins.
**Regula de fond, deja in BUSINESS_RULES cap. 7:** "36 BUC" langa UM=Buc e INFORMATIE DE AMBALARE,
nu un raport de aplicat. "x 24" e altceva — configuratia unui bax vandut ca intreg. Ca text semanau;
ca inteles, nu.
**Garda:** teste care cer explicit ca `piecesPerBox` sa intoarca 1 pentru cele sase denumiri cu
ambalare, si ca ambele functii sa dea acelasi raspuns pe formele de bax.

## ADR-054 — Raspunsul spune CINE a citit cifrele
**Decizie:** `/api/parse-invoice` intoarce `parser: 'tabel' | 'model'`, iar pagina il arata langa
textul OCR ("citit de: tabel x2" / "tabel, model").
**De ce:** Un pret gresit poate veni din doua locuri cu reparatii complet diferite: parserul
determinist (`parseInvoiceTableText`, care verifica FIECARE rand cu coloana de TVA) sau modelul
(care ghiceste coloanele). Pana acum raspunsul nu spunea care a raspuns, deci diagnosticul se facea
prin arheologie pe zecimale — la un caz real s-a ajuns sa se deduca din faptul ca `240,84 / 2239 =
0,1076` ca modelul luase pretul drept cantitate, fara sa se poata dovedi.
**Cazul amestecat e cel interesant:** textul OCR se trimite pe bucati de 3500 de caractere, si
fiecare bucata alege singura calea. "tabel x1, model x1" inseamna ca jumatate de factura a fost
citita determinist si jumatate ghicita — exact situatia in care unele produse ies corect si altele
nu, pe aceeasi scanare.
**Cost:** un camp in raspuns si o eticheta gri. Nimic din calcul nu se schimba.

## ADR-055 — Gunoiul de la inceputul denumirii rupe regula "frate"
**Decizie:** `cleanName` sterge de la inceputul denumirii si ghilimelele TIPOGRAFICE (“ ” „ « » ‘ ’),
bulinele si punctul median, nu doar pe cele drepte.
**De ce (nu e cosmetic):** cheia regulii "frate" din `parse-invoice` e "pret in bani + primele 3
cuvinte normalizate". Un singur caracter ramas lipit de denumire da alta cheie decat geamanul curat
al ACELUIASI produs, deci raportul bucati/cutie nu se mai imprumuta.
**Cazul real:** pe o factura, OCR-ul a citit "30B/CUT" ca "308/CUT" — deci raportul nu se putea lua
din denumire. Dar acelasi produs aparea pe factura si citit corect, la acelasi pret, iar regula
"frate" avea raspunsul. L-a ratat fiindca randul stalcit incepea cu U+201C: cheile erau
`6160|“nap milka cacao` si `6160|nap milka cacao`. Rezultat: 61,60 lei neimpartit, adica 97 lei
bucata in loc de ~3,23.
**De ce NU s-a "reparat" 308 => 30B:** ar fi fost o ghicitoare pe cifre (308 poate fi un numar
real). Mecanismul corect exista deja — geamanul curat de pe aceeasi factura — si trebuia doar sa nu
fie rupt de un caracter de punctuatie.
