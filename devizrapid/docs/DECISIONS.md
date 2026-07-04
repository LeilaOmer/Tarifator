# Jurnal de decizii — Tarifator

Fiecare decizie de produs importantă, cu **ce** s-a decis și **DE CE**. Scopul:
proiectul să nu depindă de istoricul conversațiilor.

> Intrările de mai jos au fost documentate retroactiv la **2026-07-03** din sesiunile
> anterioare. De aici înainte, orice decizie nouă cu impact se adaugă la zi (cea mai
> recentă sus). Format: ce s-a decis, de ce, și — unde e util — alternativa respinsă.

---

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

## ADR-010 — Corecțiile manuale de raport sunt per-user, nu partajate
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
