-- ============================================================================
-- Consimtamintele date la inregistrare — DOVADA, nu doar o bifa in browser.
-- De rulat O DATA in Supabase (SQL Editor).
--
-- PROBLEMA (gasita la audit): cele patru acorduri de pe pagina de inregistrare
-- (Termeni, GDPR, Retragere, Marketing) erau verificate in browser si apoi
-- ARUNCATE. Nu exista nicaieri cine a acceptat, ce, cand si pe ce versiune a
-- documentelor. GDPR Art. 7(1) cere insa operatorului sa poata DEMONSTRA
-- consimtamantul. In plus, acordul de marketing — singurul opt-in real — se
-- pierdea complet, deci nu putea fi nici folosit, nici respectat la dezabonare.
--
-- Dovada se pastreaza in DOUA locuri, intentionat:
--   1. `auth.users.raw_user_meta_data` — scrisa ODATA CU userul, deci exista
--      chiar daca omul nu-si confirma niciodata emailul (atunci nu exista
--      sesiune, deci nu se poate scrie in niciun tabel cu RLS);
--   2. tabelul de mai jos — forma INTEROGABILA ("cine a acceptat marketing?").
-- ============================================================================

create table if not exists consents (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- 'termeni' | 'gdpr' | 'retragere' | 'marketing'
  kind        text not null,
  -- false = a fost intrebat si a REFUZAT (conteaza la marketing)
  accepted    boolean not null,
  -- versiunea documentelor acceptate; la modificarea lor se cere din nou acordul
  version     text not null,
  accepted_at timestamptz not null default now()
);

-- Un singur rand per (user, tip, versiune): reinregistrarea aceluiasi acord nu
-- creeaza duplicate, iar `upsert` din lib/consents.ts devine idempotent.
create unique index if not exists consents_unique
  on consents (user_id, kind, version);

-- Interogarea uzuala: "cine a acceptat marketing pe versiunea curenta?"
create index if not exists consents_kind_lookup
  on consents (kind, version, accepted);

alter table consents enable row level security;

-- Userul isi poate scrie si citi PROPRIILE consimtaminte. Nu le poate STERGE
-- si nu le poate MODIFICA: o dovada pe care subiectul o poate rescrie nu mai e
-- dovada. Retragerea consimtamantului se inregistreaza ca rand NOU
-- (accepted = false, versiune noua), nu prin stergerea celui vechi.
drop policy if exists "consents_insert_own" on consents;
create policy "consents_insert_own" on consents for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "consents_select_own" on consents;
create policy "consents_select_own" on consents for select to authenticated
  using (auth.uid() = user_id);

-- Fara politici de UPDATE/DELETE => blocate pentru orice token de user.
-- Adminul citeste si administreaza prin service-role, care ocoleste RLS.

-- ---------------------------------------------------------------------------
-- Verificare (ruleaza dupa si citeste rezultatul)
-- ---------------------------------------------------------------------------
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'consents'
   and grantee in ('authenticated', 'anon')
 order by grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- UTILIZATORII EXISTENTI nu au niciun consimtamant inregistrat — s-au inscris
-- inainte de aceasta modificare, iar bifele lor nu s-au salvat nicaieri.
-- Cati sunt:
--   select count(*) from auth.users u
--    where not exists (select 1 from consents c where c.user_id = u.id);
--
-- Pentru ei, dovada NU se poate reconstitui retroactiv (ar fi chiar o falsificare).
-- Solutia corecta e sa li se ceara acordul din nou, la prima autentificare —
-- vezi docs/ROADMAP.md. Pana atunci, lipsa lor din tabel e ea insasi informatia
-- corecta: nu ai dovada pentru ei, si o stii.
-- ---------------------------------------------------------------------------
