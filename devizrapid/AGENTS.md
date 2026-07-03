<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reguli de business

Inainte de a modifica logica de TVA, preturi, SGR, cutie/bucata, abonamente,
numerotare fise sau scanare facturi, citeste `BUSINESS_RULES.md` — contine
regulile de domeniu (contabile + de produs) pe care codul trebuie sa le respecte.

# Documentatie proiect

Deciziile importante de produs se documenteaza in `docs/`, ca proiectul sa nu
depinda de istoricul conversatiilor:
- `docs/DECISIONS.md` — jurnal de decizii (ce s-a decis + DE CE).
- `docs/PRODUCT.md` — ce face produsul (module, tipuri de cont, fluxuri).
- `docs/ROADMAP.md` — ce urmeaza.
- `docs/VISION.md` — directia pe termen lung.

Regulile de domeniu (TVA/SGR/cutie-bucata/limite) raman in `BUSINESS_RULES.md`.
Cand iei o decizie de produs cu impact, scrie-o in fisierul potrivit din `docs/`.

# Disciplina de cod

- **Nu rescrie cod care merge.** Prefera editari tintite fata de rescrieri; o
  rescriere risca sa reintroduca bug-uri deja rezolvate.
- **Nu duplica logica de business.** Reutilizeaza functiile/hook-urile/
  componentele existente; extrage un helper comun in loc sa copiezi (ex.
  `lib/apiAuth.ts`, `lib/plan.ts`, tile-urile partajate din dashboard).
- **Schimbari mari sau arhitecturale => intai plan + confirmare.** Pentru
  atingeri punctuale, mergi direct; pentru refactor pe mai multe fisiere sau
  decizii de arhitectura, prezinta un plan si asteapta OK.
- **Aritmetica preturilor se face in cod, nu de AI.** La scanare, modelul doar
  citeste/transcrie; orice calcul (TVA, cutie/bucata, discount) e determinist in
  cod. Nu muta calcule inapoi in prompt.
- **Logica de business sta separata de UI.** Calculele (pret, TVA, cutie/bucata,
  limite de abonament) traiesc in `lib/` sau in rutele API (`app/api/`), NICIODATA
  in componentele UI — componentele doar citesc si afiseaza. Nu amesteca logica de
  randare cu cea de calcul (ex: `lib/pricing/calc.ts`, `lib/plan.ts`).
- **La debugging, NU schimba codul imediat.** Intai identifica: cauza probabila,
  fisierele afectate si cum se reproduce. Explica diagnosticul, apoi propune fix-ul.
  Un patch aruncat inainte de a intelege cauza reintroduce des alta problema.
- **Nu modifica generarea PDF fara sa verifici layout-ul.** PDF-urile se fac cu
  jsPDF programatic (`lib/pricing/pdf.ts`, `app/quotes/[id]`): cand schimbi
  coloane/latimi, verifica ca totul incape pe pagina (A4/landscape) si nu se
  suprapune, si uita-te la output-ul real, nu doar ca ruleaza.
- **Verifica inainte de a livra.** Ruleaza `npx tsc --noEmit` si `npm run build`
  (din `devizrapid/`) inainte de commit — build-ul complet prinde ce `tsc` nu vede.
  Mesajul de commit spune DE CE + CE se schimba; la schimbari importante, si riscul.
- **Verifica orice scriere in Supabase** (`error`), nu o ignora — un esec silentios
  arata succes fals in UI, dar datele nu se salveaza.
