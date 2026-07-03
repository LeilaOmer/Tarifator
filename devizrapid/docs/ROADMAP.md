# Roadmap — Tarifator

Ce urmează. Grupat după orizont, nu după dată fixă. Ideile neangajate sunt clar marcate.

## Înainte de lansare (detaliile rămase)
- [ ] **Stinge `PRELAUNCH`** (`lib/plan.ts`) — trece pe limitele reale pe niveluri.
- [ ] **Verifică RLS în Supabase** (sarcina utilizatorului — doar ea are acces la dashboard).
      Confirmă că fiecare tabel cu date de user are politici pe `auth.uid()`.
- [ ] **Actualizează pagina de landing** (`app/page.tsx`): prețurile afișate (Artizan 25,
      Pro 65) și „6 luni gratuit" sunt **vechi** și nu mai corespund structurii
      Free/Artizan/Mercator/Pro. De aliniat cu `docs/PRODUCT.md`.
- [ ] Reinstalarea PWA pe telefon pentru iconița nouă (cache-ul păstrează vechea iconiță).

## După lansare / când apar bani
- [ ] **Procesator de plăți** — să seteze automat `plan_tier` + `plan_active_until`
      (acum e manual). Deblochează abonamentele fără intervenție.
- [ ] **Groq Dev tier** (limite ~10×) — permite prompt mai bogat și scanare completă a
      facturilor dense (acum promptul e slăbit intenționat — vezi ADR-015).

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
