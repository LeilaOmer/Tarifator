# Tarifator

Aplicatie pentru comercianti si meseriasi din Romania: scaneaza factura de la
furnizor, calculeaza pretul de vanzare (adaos, TVA, SGR, cutie/bucata) si scoate
fisa de servicii sau raportul de activitate ca PDF.

Se foloseste de pe telefon, instalata ca PWA.

## Ruleaza local

```bash
npm install
npm run dev        # http://localhost:3000
```

Variabile de mediu (`.env.local`):

| Variabila | Rol |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | proiectul Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cheia publica, folosita din browser |
| `SUPABASE_SERVICE_ROLE_KEY` | doar pe server: contoare, stergere cont, admin |
| `GROQ_API_KEY` | citirea facturilor |
| `GROQ_VISION_MODEL` | lista de modele de vedere, separate prin virgula. GOL = se sare direct pe OCR local |
| `GROQ_TEXT_MODEL` | lista de modele de text pentru PDF/OCR |
| `RESEND_API_KEY` | emailuri de notificare |

Fara `SUPABASE_SERVICE_ROLE_KEY` aplicatia porneste, dar TOATE plafoanele zilnice
sunt oprite — apare avertisment in logurile serverului (ADR-047).

## Inainte de commit

```bash
npm test              # vitest
npx tsc --noEmit
npm run build         # prinde ce tsc nu vede
```

## SQL de rulat o data in Supabase

Fisierele din `supabase/` nu se aplica automat. Ordinea nu conteaza, dar toate
trebuie rulate inainte de lansare:

| Fisier | Ce face |
| --- | --- |
| `rls.sql` | politicile de izolare intre conturi |
| `lock-billing-columns.sql` | userul nu-si poate schimba singur planul |
| `enforce-limits.sql` | limitele impuse in DB + indexul unic pe numarul de fisa |
| `ip-throttle.sql` | plafon pe IP pentru rutele publice |
| `consents.sql` | dovada consimtamintelor GDPR |
| `indexes.sql` | indexurile de pe calea critica |

`verifica.sql` nu modifica nimic — spune care dintre ele au fost aplicate
si care lipsesc. Un fisier ne-rulat nu da nicio eroare, doar lipseste
protectia, deci merita rulat dupa fiecare.

## Unde stau regulile

- `AGENTS.md` — disciplina de cod (ce e voie si ce nu, la modificari).
- `BUSINESS_RULES.md` — regulile de domeniu: TVA, SGR, cutie/bucata, planuri,
  numerotarea fiselor. **Se citeste inainte de a atinge orice calcul.**
- `docs/DECISIONS.md` — jurnalul de decizii (ce s-a decis si DE CE).
- `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/VISION.md` — produsul si ce urmeaza.
- `docs/AUDIT-LANSARE.md` — metoda de audit de securitate.

Logica de business sta in `lib/` si in `app/api/`, niciodata in componentele UI.
Aritmetica preturilor se face in cod, nu de AI: la scanare modelul doar
transcrie, calculele sunt deterministe.
