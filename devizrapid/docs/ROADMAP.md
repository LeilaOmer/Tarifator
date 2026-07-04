# Roadmap — Tarifator

Ce urmează. Grupat după orizont, nu după dată fixă. Ideile neangajate sunt clar marcate.

## Înainte de lansare (detaliile rămase)
- [ ] **Stinge `PRELAUNCH`** (`lib/plan.ts`) — trece pe limitele reale pe niveluri.
- [x] **RLS verificat și închis (2026-07-03)** — RLS pornit pe toate tabelele; politici
      corecte (scope pe `auth.uid()`, `with_check` corect la scrieri; `product_box_ratios`
      și `api_usage` doar prin service-role). Politica publică `"allow all"` de pe `counters`
      a fost ștearsă. Opțional (necritic): `drop table counters` dacă se confirmă că e legacy.
- [x] **Landing + legal aliniate (2026-07-03)** — prețurile vechi (25/65) și „6 luni gratuit"
      înlocuite cu structura Free/Artizan/Mercator/Pro pe landing, metadata SEO, termeni și
      retragere. Afișarea prețului redus clarificată (rând verde separat).
- [ ] Reinstalarea PWA pe telefon pentru iconița nouă (cache-ul păstrează vechea iconiță).

## Din analiza multi-unghi (2026-07-03)
Făcut: contrast text mai bun (WCAG), `alert()` → toast discret, `aria-label` pe butoanele
iconiță, imagine OG pentru share. Rămas:
- [ ] **Captură reală a produsului pe landing** (fișă/PDF primit pe WhatsApp) — crește
      conversia mult pentru publicul „arată-mi". Nevoie de un screenshot real.
- [ ] **jsPDF încărcat lazy** (`dynamic import`) în `/quotes/[id]` și `lib/pricing/pdf.ts` —
      scoate ~350 KB din bundle-ul inițial. NEatins încă: e pe calea critică de PDF, de
      făcut cu verificare vizuală a output-ului (regula din AGENTS.md).
- [ ] **Poziționare preț Mercator** (129) e la doar 20 lei sub Pro (149) — de reconsiderat
      dacă nu e ancorare intenționată spre Pro.

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
