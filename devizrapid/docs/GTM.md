# Plan de lansare (GTM) — Tarifator

Cum ajunge Tarifator la utilizatori și la primii bani. Complementar cu
`docs/ROADMAP.md` (ce se construiește) și `docs/VISION.md` (unde mergem pe termen
lung). Regulile de domeniu rămân în `BUSINESS_RULES.md` — aici nu se duplică.

> Documentul a pornit de la o listă de tactici „cum vinzi fără audiență"
> (afiliere, ProductHunt, directoare, SEO/GEO, Reddit, AppSumo lifetime deal) plus
> sugestia de „programmatic SEO". Concluzia analizei e mai jos: lista e scrisă
> pentru microSaaS **global, în engleză**, iar Tarifator nu e așa ceva.

---

## 1. Cine suntem, din perspectiva distribuției

Trei constrângeri decid ce canale funcționează și care sunt pierdere de timp:

1. **Suntem RO-only.** `<html lang="ro">`, fără i18n, fără rutare pe limbi.
   Prețurile sunt în lei. Regulile de TVA 11/21 și SGR (0,50 lei) sunt specific
   românești. Produsul **nu e vandabil în afara României** fără o rescriere.
2. **Publicul nu e „tech".** Electricieni, instalatori, coafori, mecanici, mici
   comercianți (`docs/VISION.md`: „omul de pe teren", „Ținta e omul mic, nu
   corporația"). Nu citesc Product Hunt, nu au cont de AppSumo, nu sunt pe Reddit.
3. **Produsul e construit, dar nu poate încasa.** Vezi tabelul de mai jos.

## 2. Starea reală, pe dovezi

Fiecare rând e verificabil în cod. Se actualizează pe măsură ce se rezolvă.

| Fapt | Unde se vede |
|---|---|
| Nu se pot încasa bani; `/upgrade` trimite la o adresă de Gmail | `app/upgrade/page.tsx`, `docs/PRODUCT.md` |
| Fără entitate juridică („persoană fizică, în curs de înregistrare") | `app/termeni/page.tsx` |
| `prelaunch = true` → toți utilizatorii au azi Pro nelimitat | `lib/plan.ts` (`isPrelaunch()`) |
| Adresa publică implicită poartă numele vechi al proiectului | `lib/site.ts` (`devizele-mele.vercel.app`) |
| Doar 4 URL-uri indexabile, dar ~120 de keyword-uri țintite | `app/sitemap.ts` vs. `app/layout.tsx` |
| Zero analytics — și o promisiune publică de „nu urmărim activitatea" | absent; `app/components/CookieBanner.tsx` |
| Listă de marketing colectată legal, niciodată folosită | `lib/consents.ts`, `supabase/consents.sql`, `resend` în dependențe |
| Matematică deterministă gata de refolosit în pagini publice | `lib/pricing/calc.ts` (testat în `calc.test.ts`) |

Ultimele două rânduri sunt active neexploatate, nu probleme.

## 3. Verdict pe canale

**Se aplică bine:**
- **SEO/GEO constant** — singurul canal care compune în timp și singurul unde
  intenția de căutare există deja în română („calculator adaos comercial",
  „cum calculez prețul de vânzare", „TVA 11%"). Detalii în §5, Etapa 3.
- **Afiliere prin CONTABILI** — nu afiliați generici. Un contabil are 40-80 de
  clienți mici, exact publicul nostru, și are încrederea lor pe bani. ADR-003
  arată că planul Mercator a fost cerut chiar de un contabil real: primul afiliat
  există deja, doar că nu i s-a cerut nimic.

**Se aplică ieftin și târziu:**
- **Directoare software** — aduc backlink-uri, nu clienți. Listele RO de „programe
  de facturare" contează mai mult decât G2/Capterra. **Blocat de domeniu:** altfel
  se listează peste tot o adresă pe care o abandonăm și se refac toate.
- **ProductHunt** — public global, în engleză, tech. Valoare reală ≈ un backlink de
  autoritate. Se face cu efort minim sau deloc; **niciodată ca eveniment central**
  de lansare.

**Se înlocuiește:**
- **Reddit** → grupuri de Facebook RO (meseriași, PFA, comercianți, contabili),
  forumuri (avocatnet, contzilla), TikTok. Reddit-ul românesc e mic și
  tânăr/urban/IT — nu instalatori și patroni de magazin.

**Se respinge:**
- **AppSumo lifetime deal** — audiență engleză globală; un produs RO-only cu TVA
  românesc e nevandabil acolo. Peste asta, un LTD vinde pe veci apeluri Groq
  nelimitate contra unei plăți unice, iar ADR-015 arată că promptul e deja slăbit
  intenționat ca să încapă pe tier-ul gratuit Groq. Ar transforma fiecare vânzare
  într-o pierdere recurentă.

**Programmatic SEO — da, dar nu în varianta „mii de pagini".** Paginile subțiri
generate în masă sunt exact ce penalizează Google. Varianta corectă aici e mică și
onestă: calculatoare publice care chiar funcționează, peste `lib/pricing/calc.ts`.
Un calculator real nu e o pagină subțire — e o unealtă, un demo de produs și o
dovadă de corectitudine, în același URL.

## 4. Regula de secvențiere

**Nimic din distribuție înainte de deblocatori.** Trafic adus peste un funnel care
se termină într-o adresă de Gmail = utilizatori pierduți definitiv; iar fără
analytics nu se poate ști ce canal a funcționat, deci nici măcar nu se învață ceva
din pierdere. Fereastra de lansare se consumă o singură dată.

## 5. Etapele

### Etapa 1 — deblocatorii
1. **Formă juridică.** Precondiție legală pentru abonamente recurente; nu e muncă
   de cod, dar blochează tot restul și are timp de așteptare. De pornit prima.
2. **Domeniu propriu** (`tarifator.ro` sau echivalent). Implementarea e o singură
   variabilă de mediu: `NEXT_PUBLIC_SITE_URL` în Vercel — `lib/site.ts` a fost
   centralizat exact pentru asta (ADR-050). De refăcut verificarea Google Search
   Console pe noua adresă (meta-ul din `app/layout.tsx`).
3. **Procesator de plăți** — să seteze automat `plan_tier` + `plan_active_until`.
   De comparat Stripe vs. merchant-of-record (Lemon Squeezy/Paddle, care preiau
   TVA-ul) vs. Netopia/PayU. Alegerea depinde de forma juridică de la pasul 1.
4. **Analytics cookieless** (Plausible/Umami). Constrângere fermă: `CookieBanner.tsx`
   promite „Nu urmărim activitatea". Orice soluție trebuie să respecte textul — sau
   textul se schimbă odată cu ea. GA/gtag nu e o opțiune fără a ne contrazice public.
5. **Confirmarea pe email pornită** în Supabase + SMTP propriu (Resend e deja
   dependență) — vezi secțiunea anti-abuz din `docs/ROADMAP.md`.

### Etapa 2 — stingerea `prelaunch` fără prăpastie
Ordinea contează: azi toți utilizatorii au Pro nelimitat, iar un `update` direct
i-ar arunca peste noapte la 3 fișe + 3 calcule pe lună, fără buton de plată.
1. Plățile funcționale (Etapa 1).
2. **Email către cei care au bifat marketing.** Lista există deja, colectată legal
   în tabelul `consents`; `supabase/consents.sql` documentează chiar interogarea
   „cine a acceptat marketing?", iar Resend e instalat. Nu s-a trimis niciodată
   nimic. E cel mai ieftin canal pe care îl avem și e complet neatins.
3. **Punte pentru early adopters.** `PROMO_CAP = 50` (`lib/promoCap.ts`) există deja.
   De decis dacă utilizatorii din pre-lansare primesc automat prețul redus, ca
   stingerea flag-ului să fie o ofertă, nu o pedeapsă.
4. Abia apoi: `update app_config set value='false' where key='prelaunch';`

### Etapa 3 — motorul SEO/GEO (după domeniu)
1. **Calculatoare publice**, fără login, indexabile: `/calculator/adaos-comercial`,
   `/calculator/tva`, `/calculator/pret-vanzare`, `/calculator/sgr`. Refolosesc
   funcțiile din `lib/pricing/calc.ts` — **matematica nu se rescrie** (regula din
   `AGENTS.md`: logica de business stă în `lib/`, componentele doar afișează). Dacă
   un calculator public dă alt rezultat decât aplicația, am pierdut exact lucrul pe
   care îl vindem.
2. **Pagini pe meserie** (`/pentru/electrician` etc.), din lista de keyword-uri deja
   existentă în `app/layout.tsx`. Doar cu conținut chiar diferit per meserie —
   altfel sunt pagini subțiri și fac rău, nu bine.
3. **`app/sitemap.ts`** extins să genereze URL-urile noi din aceeași sursă de date ca
   paginile: o singură listă, nu două care se desincronizează tăcut.
4. **Schema markup** pe fiecare calculator. Asta e partea de „GEO": motoarele AI
   (ChatGPT, Perplexity, Google AI) citează structura și datele verificabile, nu
   backlink-urile. Nu e o strategie separată — sunt aceleași pagini.
5. **Captura reală de produs pe landing** (fișă/PDF primit pe WhatsApp) — deja item
   deschis în `docs/ROADMAP.md`, marcat „crește conversia mult". Fără ea, orice
   trafic adus mai sus se lovește de o pagină fără nicio dovadă vizuală.

### Etapa 4 — distribuție
1. Grupuri de Facebook RO + forumuri (avocatnet, contzilla).
2. **Afiliere prin contabili:** cod de recomandare, atribuire în DB, raport de
   comisioane. De început cu contabilul din ADR-003.
3. Directoare, într-un singur lot, pentru backlink-uri.
4. ProductHunt, opțional, efort minim, doar pentru backlink.
5. AppSumo: nu.

## 6. Definiția lui „gata de lansare"

Toate adevărate simultan:
- [ ] Entitate juridică înregistrată.
- [ ] Domeniu propriu activ, `NEXT_PUBLIC_SITE_URL` setat, Search Console verificat.
- [ ] Un utilizator poate plăti singur, fără intervenție manuală.
- [ ] Analytics cookieless activ, coerent cu textul din `CookieBanner.tsx`.
- [ ] Confirmarea pe email pornită, cu SMTP propriu.
- [ ] Utilizatorii din pre-lansare au primit un email și o ofertă înainte de
      stingerea flag-ului.
- [ ] Landing-ul are cel puțin o captură reală de produs.
- [ ] `prelaunch` stins.

Monitorizarea erorilor (Sentry) rămâne pe `docs/ROADMAP.md` ca neblocantă, dar
înainte de trafic real devine greu de justificat absența: azi erorile din producție
mor tăcut.

> Decizia de canale, cu motivele respingerilor: ADR-055 din `docs/DECISIONS.md`.
