# Roadmap — Tarifator

Ce urmează. Grupat după orizont, nu după dată fixă. Ideile neangajate sunt clar marcate.

## Înainte de lansare (detaliile rămase)
- [ ] **Rulează `supabase/enforce-limits.sql`** în Supabase (o dată) — creează `app_config`
      + triggerele care impun limitele în DB + indexul unic pe numărul de fișă.
- [ ] **Rulează `supabase/consents.sql`** în Supabase (o dată) — tabelul de consimțăminte
      (ADR-040). Fără el, dovada GDPR există doar în `user_metadata`: validă, dar
      neinterogabilă („cine a acceptat marketing?").
- [ ] **Rulează `supabase/indexes.sql`** în Supabase (o dată) — indexurile de pe calea critică
      (ADR-045). De făcut cât tabelele sunt mici: atunci crearea e instantanee și nu blochează
      scrierile.
- [ ] **La lansare, stinge pre-lansarea** cu un singur update:
      `update app_config set value='false' where key='prelaunch';` (UI + DB se sting împreună).
- [x] **RLS verificat și închis (2026-07-03)** — RLS pornit pe toate tabelele; politici
      corecte (scope pe `auth.uid()`, `with_check` corect la scrieri; `product_box_ratios`
      și `api_usage` doar prin service-role). Politica publică `"allow all"` de pe `counters`
      a fost ștearsă. Opțional (necritic): `drop table counters` dacă se confirmă că e legacy.
- [x] **Landing + legal aliniate (2026-07-03)** — prețurile vechi (25/65) și „6 luni gratuit"
      înlocuite cu structura Free/Artizan/Mercator/Pro pe landing, metadata SEO, termeni și
      retragere. Afișarea prețului redus clarificată (rând verde separat).
- [ ] Reinstalarea PWA pe telefon pentru iconița nouă (cache-ul păstrează vechea iconiță).

## Din auditul complet (2026-07-04)
Rezolvate în aceeași zi: **C1** resetare parolă (+ schimbare parolă în Setări), **C3**
export date GDPR, **I2** auth+limită pe ANAF, **C2** limitele impuse în DB (`supabase/
enforce-limits.sql`, comutator `app_config.prelaunch`), **I4** index unic pe numărul de
fișă (în același SQL), **I5** curățare sincronă a stării de cont la schimbarea userului.
Rămase (neblocante):
- [ ] `buildPDF` mutat din `app/quotes/[id]` în `lib/` (regula „logica separată de UI").
- [ ] `playSuccessSound` duplicat (quick + quotes/[id]) — de extras într-un helper.
- [ ] Consumul de fișe numărat într-un tabel de consum (ca `pricing_usage`), nu pe
      rândurile din `quotes` — ștergerea unei fișe nu ar mai elibera cota lunară.
- [ ] Monitorizare erori (ex. Sentry free tier) — erorile din producție mor tăcut.
- [ ] Mesaj în UI la scanarea PDF: „se citește doar prima pagină".
- [ ] `canonical_email` căutat în `profiles`, nu prin `listUsers()`. Azi `/api/check-signup` și
      `/api/admin/lifetime` parcurg paginat `auth.users` (plafonat la 5 pagini ≈ 5000 conturi,
      ADR-041) — peste asta verificarea devine incompletă, nu doar lentă. Un index nu ajută:
      e nevoie ca `canonical_email` să ajungă în `profiles` la înregistrare și căutarea să se
      mute acolo (vezi ADR-045).

## Din analiza multi-unghi (2026-07-03)
Făcut: contrast text mai bun (WCAG), `alert()` → toast discret, `aria-label` pe butoanele
iconiță, imagine OG pentru share. Rămas:
- [ ] **Captură reală a produsului pe landing** (fișă/PDF primit pe WhatsApp) — crește
      conversia mult pentru publicul „arată-mi". Nevoie de un screenshot real.
- [ ] **jsPDF încărcat lazy** (`dynamic import`) în `/quotes/[id]` și `lib/pricing/pdf.ts` —
      scoate ~350 KB din bundle-ul inițial. NEatins încă: e pe calea critică de PDF, de
      făcut cu verificare vizuală a output-ului (regula din AGENTS.md).
- [ ] **Prețul lui Mercator** (129, la doar 20 lei sub Pro 149). Planul în sine NU se
      taie — a fost cerut de un contabil, e cerere validată (vezi ADR-003). De decis:
      preț mai mic (~79-89, „plătesc doar ce folosesc") sau păstrat ca ancoră spre Pro.
      Ideal: întrebat contabilul care l-a cerut ce ar plăti clienții lui.

## După lansare / când apar bani
- [ ] **Procesator de plăți** — să seteze automat `plan_tier` + `plan_active_until`
      (acum e manual). Deblochează abonamentele fără intervenție.
- [ ] **Groq Dev tier** (limite ~10×) — permite prompt mai bogat și scanare completă a
      facturilor dense (acum promptul e slăbit intenționat — vezi ADR-015).
- [ ] **Confirmare pe telefon (SMS OTP)** — Supabase phone auth + furnizor SMS
      (Twilio/Vonage). Cel mai puternic anti-abuz freemium, DAR costă bani/SMS + fricțiune
      la înregistrare. Doar când apar venituri și abuz real. (Vezi anti-abuz de mai jos.)

## Anti-abuz freemium (înregistrare)
- [x] **Făcut (2026-07-04)**: la înregistrare se resping emailurile temporare (temp-mail)
      și duplicatele Gmail cu `+tag`/puncte (`lib/emailGuard.ts` + `/api/check-signup`);
      buton „retrimite emailul de confirmare" pe login.
- [ ] **Pornește confirmarea pe email** — cod deja gata (login tratează cazul „fără sesiune
      → verifică emailul"). De făcut în Supabase: Auth → „Confirm email" = ON + SMTP propriu
      (Resend, deja în proiect) + Redirect URL. Fără SMTP propriu, emailul built-in Supabase
      e plafonat și ajunge în spam.
- Telefon/SMS = pasul următor (mai sus), când merită costul.

## Idei (neangajate — NU sunt promisiuni)
- **Audit log**: cine ce a modificat/șters/exportat și când (tabel `audit_log` cu user_id,
  acțiune, tabel, id_rând, valori vechi/noi, timestamp). Util când vor exista clienți
  business cu cerințe de conformitate. Loginurile sunt deja acoperite de logurile Supabase Auth.
- **Export către software de contabilitate** (ex. Senior ERP / SAGA) — ar atrage contabili.
- **Adaos minim configurabil per categorie.**
- **Alertă de preț schimbat** față de ultima factură a aceluiași furnizor (folosind istoricul
  `product_box_ratios` / prețuri).
- **Aliniere navy**: logo-ul folosește `#04295c`, paleta app `#002B5B` (diferență invizibilă);
  de unificat dacă vrem strictețe.
- **Variante de logo**: wordmark „Papirus Tabac", variantă alb-negru pentru ștampilă/print.

> Ideile de aici se pot muta în `DECISIONS.md` când sunt asumate ferm.

## Re-consimtamant pentru utilizatorii vechi (GDPR)
Cei inregistrati inainte de ADR-040 nu au dovada consimtamantului — bifele lor nu s-au salvat
nicaieri, iar reconstituirea retroactiva ar fi o falsificare. La prima autentificare, daca userul
nu are randuri in `consents` pentru `CONSENT_VERSION` curenta, i se arata documentele si i se cere
acordul din nou. Acelasi mecanism serveste si la MODIFICAREA documentelor: se incrementeaza
`CONSENT_VERSION` si toata lumea reconfirma.
Cati sunt acum:
  select count(*) from auth.users u
   where not exists (select 1 from consents c where c.user_id = u.id);
