---
name: audit-lansare
description: >-
  Audit adversarial de pregatire pentru productie (security + readiness) al
  tarifatorului DevizRapid, bazat pe DOVEZI nu pe presupuneri. Foloseste-l cand
  userul cere un audit de securitate, o verificare inainte de lansare/deploy, un
  "security review", sau intreaba "e gata de productie?" / "e sigur sa lansez?".
  Vaneaza: izolare multi-tenant / IDOR pe fise-clienti-firme, rute cu service-role
  care ocolesc RLS, limite de abonament impuse doar in UI (nu si in DB), flag-ul
  prelaunch, enumerare de useri, scurgeri de chei (service-role / Groq) in bundle,
  upload de facturi, XXE la e-Factura, injectie de prompt prin factura. NU verifica
  logica de business (TVA/SGR/cutie-bucata) — aia e skill-ul reguli-business.
  Sursa de adevar a metodei: devizrapid/docs/AUDIT-LANSARE.md — citeste-o INTAI.
---

# Audit de lansare — Tarifator

Un audit adversarial, bazat pe dovezi, al pregatirii pentru productie. Metoda
completa (fazele, regulile, suprafata de atac mulata pe aplicatie) traieste in
**`devizrapid/docs/AUDIT-LANSARE.md`** — singura sursa de adevar. Citeste-o INTAI.

## Cand se aplica

Activeaza-l cand userul cere (in orice formulare):

- "fa un audit de securitate" / "security review" / "verifica-l inainte sa lansez";
- "e gata de productie?" / "e sigur sa dau drumul?" / "check de readiness";
- audit al unei rute API noi, al RLS-ului, al limitelor de abonament sau al
  manipularii secretelor.

NU e pentru bug-uri de logica de business (TVA 11/21, SGR, cutie/bucata, calcule
de pret) — aia e `reguli-business`. Cele doua sunt complementare.

## Ce sa faci

1. **Ruleaza Regula 0 prima** (din doc): confirma ca ai acces real la cod. Fara
   acces, REFUZA — nu fabrica un raport.
2. **Citeste `devizrapid/docs/AUDIT-LANSARE.md`** si urmeaza fazele in ordine.
   Nu te baza pe memorie pentru suprafata de atac — e specifica acestei aplicatii.
3. **Pune un verdict pe fiecare afirmatie**: ✅ VERIFICAT (`fisier:linie`) /
   ❌ ABSENT (cu termenii de cautare) / ❓ NECONFIRMAT (ce ar dovedi-o). Afirmat ≠
   verificat. Absent e o gasire, nu un pass.
4. **Enumera multimile finite** — toate cele 12 rute din `app/api/`, toate variabilele
   de mediu, toate triggerele din `supabase/`. Fara acoperire din esantion.
5. **Nu umfla severitatea** pe banuieli. Fiecare gasire: severitate × incredere,
   legata de un activ real (fise, clienti, firme, limite, chei).
6. **Un fix e "gata" doar cand testul lui de exploit trece** — nu cand codul pare
   corect. La re-audit, verifica doar delta.

## Reperele de risc (start rapid — verdictul il pui tu, cu dovada)

- **Multi-tenant / IDOR**: `app/quotes/[id]`, `clients`, `companies`, `edit-quote`,
  `delete-account` — userul are voie la ACEA resursa, nu doar autentificat?
- **Rute cu service-role** (ocolesc RLS): `box-ratio`, `promo-status`, `check-signup`,
  `delete-account`, `parse-invoice`, `admin/lifetime`, `lib/rateLimit.ts` — isi
  verifica apelantul INAINTE de a folosi cheia?
- **Limite in DB, nu doar UI**: `supabase/enforce-limits.sql` oglindeste `lib/plan.ts`?
  Un user care scrie direct in Supabase cu tokenul lui depaseste limita? Cine poate
  seta `prelaunch=true` in `app_config`?
- **Secrete**: `SUPABASE_SERVICE_ROLE_KEY` / `GROQ_API_KEY` niciodata `NEXT_PUBLIC_`,
  niciodata in bundle client.
- **Enumerare**: `check-signup` (409 "are deja cont"), raspunsuri de login/reset.
- **Externe**: XXE la `efactura.ts`, SSRF/rate la `anaf-lookup`, secret pe
  webhook-urile `notify-*`, injectie de prompt prin continut de factura.

Detaliile complete si formatul de iesire (nota A-F, verdict Gata/Conditii/Nu lansa,
tabel de gasiri, diff-uri, roadmap): in `devizrapid/docs/AUDIT-LANSARE.md`.
