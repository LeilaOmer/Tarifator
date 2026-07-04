# Produs — Tarifator

Ce face produsul azi. Regulile exacte (formule, cote, praguri) sunt în
`BUSINESS_RULES.md`; aici e imaginea de ansamblu.

## Ce este
O aplicație web (PWA — merge și instalată pe telefon) care răspunde la „cât costă?"
pentru două categorii de utilizatori, prin două module.

## Cele două module
1. **Fișe Servicii** (`/quick`, `/quotes`, `/services`, `/clients`)
   — pentru **prestatori** (electricieni, instalatori, mecanici, coafori etc.).
   Dictezi vocal ce ai lucrat → aplicația recunoaște serviciile, pune cantitățile
   și prețurile tale, calculează totalul, generează un PDF de trimis clientului.
2. **Calculator Preț** (`/pricing`, `/calcule`)
   — pentru **comercianți** (magazine, distribuitori, revânzători).
   Introduci sau **scanezi** factura de furnizor → obții prețul de vânzare cu adaos,
   TVA și rotunjire. Export PDF (variantă contabil / variantă magazin).

## Trei axe care se confundă ușor (nu le amesteca)
1. **Modul** = ce face aplicația (Fișe Servicii / Calculator Preț).
2. **Mod de lucru** (`profiles.account_type` = `artizan` | `pro`) = regimul de lucru,
   **liber pentru toți**: `artizan` („Simplu") fără TVA, o firmă; `pro` („Firmă") cu
   TVA, mai multe firme.
3. **Tip de cont / abonament** (`profiles.plan_tier`) = ce a plătit userul; controlează
   DOAR limitele lunare.

`Mercator` e numele unui **tip de cont** (abonament), nu al modulului. Modulul se
cheamă „Calculator Preț".

## Tipuri de cont și limite (abonament)
| Tip cont | Preț | Primii 50 | Fișe/lună | Calcule/lună |
|---|---|---|---|---|
| Free | gratis | gratis | 3 | 3 |
| Artizan | 59 lei | 39 lei | nelimitat | 3 |
| Mercator | 129 lei | 89 lei | 3 | nelimitat |
| Pro | 149 lei | 99 lei | nelimitat | nelimitat |

- **TVA + firme multiple** sunt gratuite pentru toți (axă separată de abonament).
- **Freemium**: primele 30 de zile de la înregistrare → 30 fișe + 30 calcule, apoi
  cade pe Free (3+3). Free e podeaua permanentă.
- **PRELAUNCH** (`lib/plan.ts`): cât e `true`, oricine e tratat ca Pro (totul
  nelimitat). Se stinge manual la lansare.
- Activarea abonamentului e **manuală** (se setează `plan_tier` + `plan_active_until`
  în DB) până la integrarea unui procesator de plăți.
- **Acces gratuit pe viață**: coloana `profiles.lifetime = true` → Pro nelimitat permanent,
  fără expirare (acordat manual unor oameni care au ajutat proiectul). Vezi ADR-019.

## Fluxuri cheie
- **Fișă prin dictare**: buton mic → înregistrare → Whisper transcrie → model text
  extrage serviciile → cod calculează → fișă cu număr `DR-YYYYMM-NNN` → PDF/WhatsApp.
- **Scanare factură**: poză/PDF/e-Factură → model Groq **doar citește** numerele →
  codul face aritmetica (TVA, cutie/bucată, discount, SGR) → listă de produse cu preț.
- **Calcul preț**: cost intrare → +adaos → (±TVA după regim) → rotunjire → preț vânzare.
- **Export**: PDF generat cu jsPDF → previzualizare (și pe mobil) → partajare WhatsApp.

## Utilizatori țintă
- **Prestatori de servicii** — emit fișe, lucrează cu clienți pe teren.
- **Mici comercianți** — cumpără produse, trebuie să calculeze prețul de vânzare.

## Stack (pe scurt)
Next.js (App Router) + TypeScript + Tailwind; Supabase (Auth + Postgres + RLS);
Groq pentru AI (vedere pentru poze, text pentru PDF/dictare, Whisper pentru voce).
Harta codului: `BUSINESS_RULES.md` cap. 10.
