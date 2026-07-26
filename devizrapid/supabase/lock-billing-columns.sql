-- ============================================================================
-- Blocheaza ESCALADAREA DE PRIVILEGII pe coloanele de abonament.
-- De rulat O DATA in Supabase (SQL Editor). PRIORITATE MAXIMA — pana nu ruleaza,
-- orice utilizator isi poate acorda singur Pro pe viata.
--
-- PROBLEMA (gasita la audit, dovedita in sursa):
--   Politica `profiles_own` din rls.sql e la nivel de RAND, nu de COLOANA:
--     create policy "profiles_own" on profiles for all to public
--       using (auth.uid() = id) with check (auth.uid() = id);
--   Asta permite orice UPDATE pe orice coloana a propriului rand. Iar `profiles`
--   contine exact coloanele care decid banii: plan_tier, plan_active_until,
--   lifetime. Din consola browserului, autentificat normal:
--
--     await supabase.from('profiles')
--       .update({ lifetime: true })
--       .eq('id', (await supabase.auth.getUser()).data.user.id)
--
--   => `getEffectiveLimits` (lib/plan.ts) intoarce imediat TIER_LIMITS.pro, iar
--   triggerul `enforce_monthly_limit` (enforce-limits.sql) face `return new`.
--   AMBELE straturi de aparare citesc o valoare pe care userul o scrie singur.
--
-- SOLUTIA: RLS decide CE RANDURI vezi; granturile decid CE COLOANE poti scrie.
-- Sunt mecanisme diferite si complementare — RLS singur nu poate face asta.
-- ============================================================================

-- 1) Retrage dreptul de SCRIERE pe coloanele de facturare.
--    Citirea ramane permisa (UI-ul arata abonamentul in /settings).
--    `authenticated` = orice user logat; `anon` = vizitator. Le acoperim pe ambele.
revoke update (plan_tier, plan_active_until, lifetime) on public.profiles from authenticated;
revoke update (plan_tier, plan_active_until, lifetime) on public.profiles from anon;

-- 2) Un `revoke` pe coloane nu are efect daca exista un grant pe TOT tabelul
--    (Postgres il considera acoperitor). Deci: retragem update-ul global, apoi
--    il reacordam EXPLICIT doar pe coloanele pe care userul are voie sa le
--    schimbe din aplicatie. Orice coloana noua adaugata in viitor va fi implicit
--    NEscriibila — fail-closed, exact pe dos fata de comportamentul de pana acum.
revoke update on public.profiles from authenticated, anon;

grant update (
  company_name,
  cui,
  address,
  phone,
  email,
  bank,
  iban,
  vat_rate,
  account_type,
  primary_module
) on public.profiles to authenticated;

-- 3) Verificare — ruleaza dupa si CITESTE rezultatul.
--    Lista trebuie sa contina EXACT coloanele de la punctul 2.
--    Daca apar plan_tier / plan_active_until / lifetime, gaura e inca deschisa.
select grantee, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'profiles'
   and privilege_type = 'UPDATE'
   and grantee in ('authenticated', 'anon')
 order by grantee, column_name;

-- 4) TESTUL NEGATIV — partea care conteaza cu adevarat.
--    Punctul 3 arata CONFIGURATIA; asta arata COMPORTAMENTUL. Sunt lucruri
--    diferite (vezi docs/AUDIT-LANSARE.md: "un gard activat dar netestat e tratat
--    ca mai rau decat lipsa lui — da incredere falsa").
--
--    Rulam ca un UTILIZATOR OBISNUIT, nu ca proprietarul bazei:
--      `set local role authenticated`      -> se aplica granturile pe coloane
--      `set local request.jwt.claims`      -> auth.uid() functioneaza, deci si RLS
--    Totul in tranzactii cu ROLLBACK: nu se modifica nimic real.
--
--    Ia-ti intai id-ul si inlocuieste-l mai jos (de 2 ori in fiecare bloc):
--      select id, email from auth.users where email = 'adresa@ta.ro';

-- 4a) TREBUIE SA ESUEZE: 42501 "permission denied for column lifetime"
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"PUNE-AICI-UUID-UL","role":"authenticated"}';
  update profiles set lifetime = true where id = 'PUNE-AICI-UUID-UL';
rollback;

-- 4b) TREBUIE SA ESUEZE: permission denied for column plan_tier
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"PUNE-AICI-UUID-UL","role":"authenticated"}';
  update profiles set plan_tier = 'pro', plan_active_until = now() + interval '10 years'
   where id = 'PUNE-AICI-UUID-UL';
rollback;

-- 4c) TREBUIE SA REUSEASCA ("UPDATE 1") — altfel am rupt Setarile pentru useri.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"PUNE-AICI-UUID-UL","role":"authenticated"}';
  update profiles set phone = '0722000000' where id = 'PUNE-AICI-UUID-UL';
rollback;

-- 4d) Izolarea intre conturi (RLS, nu granturi) — TREBUIE "UPDATE 0":
--     userul A incearca sa scrie in randul userului B pe o coloana permisa.
--     Zero randuri afectate = RLS l-a filtrat. Pune doua id-uri DIFERITE.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID-USER-A","role":"authenticated"}';
  update profiles set phone = '0799999999' where id = 'UUID-USER-B';
rollback;

-- ============================================================================
-- NOTA pentru activarea manuala a abonamentelor (BUSINESS_RULES cap. 5):
-- se face in continuare din SQL Editor / cu cheia service-role, care ocoleste
-- si RLS, si granturile. Fluxul tau de lucru nu se schimba:
--   update profiles set plan_tier = 'pro',
--          plan_active_until = now() + interval '1 month'
--    where id = '<user-id>';
-- ============================================================================
