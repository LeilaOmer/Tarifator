-- ============================================================================
-- Politici RLS (Row Level Security) — izolarea intre utilizatori.
-- De rulat O DATA in Supabase (SQL Editor). Reproduce starea din DB intr-un
-- fisier versionat, ca sa poata fi revizuita, reprodusa pe un proiect nou si
-- sa aiba istoric. Oglinda a ceea ce era deja aplicat manual in dashboard —
-- singura schimbare fata de DB: politicile DUPLICATE au fost consolidate intr-una
-- singura per tabel (comportament identic).
--
-- Regula generala: fiecare user vede/scrie DOAR randurile lui (auth.uid() = user_id).
-- app_config traieste in enforce-limits.sql (citire publica, scriere service-role).
-- Limitele lunare (triggere) tot acolo. Acest fisier e DOAR despre izolare.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabele de tenant: acces doar la propriile randuri (auth.uid() = user_id).
-- Fiecare: activeaza RLS, sterge politicile vechi (ambele nume folosite in
-- dashboard), creeaza una canonica.
-- ---------------------------------------------------------------------------

-- quotes
alter table quotes enable row level security;
drop policy if exists "own data"   on quotes;
drop policy if exists "quotes_own" on quotes;
create policy "quotes_own" on quotes for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- quote_items: proprietarul e userul fisei-parinte
alter table quote_items enable row level security;
drop policy if exists "own data"        on quote_items;
drop policy if exists "quote_items_own" on quote_items;
create policy "quote_items_own" on quote_items for all to public
  using      (auth.uid() = (select user_id from quotes where id = quote_items.quote_id))
  with check (auth.uid() = (select user_id from quotes where id = quote_items.quote_id));

-- clients
alter table clients enable row level security;
drop policy if exists "own data"    on clients;
drop policy if exists "clients_own" on clients;
create policy "clients_own" on clients for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- companies
alter table companies enable row level security;
drop policy if exists "own companies" on companies;
drop policy if exists "companies_own" on companies;
create policy "companies_own" on companies for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- services
alter table services enable row level security;
drop policy if exists "own data"     on services;
drop policy if exists "services_own" on services;
create policy "services_own" on services for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- profiles: cheia e id (= auth.uid()), nu user_id
alter table profiles enable row level security;
drop policy if exists "own profile"  on profiles;
drop policy if exists "profiles_own" on profiles;
create policy "profiles_own" on profiles for all to public
  using (auth.uid() = id) with check (auth.uid() = id);

-- pricing_drafts
alter table pricing_drafts enable row level security;
drop policy if exists "own pricing drafts" on pricing_drafts;
create policy "pricing_drafts_own" on pricing_drafts for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- pricing_usage: insert propriu + citire proprie (consum lunar de calcule)
alter table pricing_usage enable row level security;
drop policy if exists "Users can insert own pricing usage" on pricing_usage;
drop policy if exists "Users can view own pricing usage"   on pricing_usage;
create policy "pricing_usage_insert_own" on pricing_usage for insert to public
  with check (auth.uid() = user_id);
create policy "pricing_usage_select_own" on pricing_usage for select to public
  using (auth.uid() = user_id);

-- invoice_scan_logs: insert propriu + citire proprie (contor scanari)
alter table invoice_scan_logs enable row level security;
drop policy if exists "Users insert own logs" on invoice_scan_logs;
drop policy if exists "Users see own logs"    on invoice_scan_logs;
create policy "invoice_scan_logs_insert_own" on invoice_scan_logs for insert to public
  with check (auth.uid() = user_id);
create policy "invoice_scan_logs_select_own" on invoice_scan_logs for select to public
  using (auth.uid() = user_id);

-- usage_logs
alter table usage_logs enable row level security;
drop policy if exists "Utilizatorul vede doar logurile proprii" on usage_logs;
create policy "usage_logs_own" on usage_logs for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- social_content: citire/modificare/stergere proprie (fara insert = scris din alta parte)
alter table social_content enable row level security;
drop policy if exists "social_content_owner_select" on social_content;
drop policy if exists "social_content_owner_update" on social_content;
drop policy if exists "social_content_owner_delete" on social_content;
create policy "social_content_owner_select" on social_content for select to public
  using (auth.uid() = user_id);
create policy "social_content_owner_update" on social_content for update to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "social_content_owner_delete" on social_content for delete to public
  using (auth.uid() = user_id);

-- feedback: userul poate DOAR sa insereze (citirea o face adminul via service-role)
alter table feedback enable row level security;
drop policy if exists "Users can insert feedback" on feedback;
create policy "feedback_insert_own" on feedback for insert to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Tabele accesate DOAR prin service-role (rutele API verifica identitatea intai).
-- RLS pornit + ZERO politici = blocate pentru orice token de user; service-role
-- ocoleste RLS. Asa trebuie sa ramana.
-- ---------------------------------------------------------------------------
alter table api_usage         enable row level security;  -- lib/rateLimit.ts
alter table deleted_accounts  enable row level security;  -- app/api/delete-account
alter table product_box_ratios enable row level security; -- box-ratio + parse-invoice

-- ---------------------------------------------------------------------------
-- Tabele NEFOLOSITE in cod (grep gol in app/ + lib/). Ramase probabil dintr-o
-- abordare veche. `counters` avea o politica slaba (orice user autentificat).
-- Recomandare: sterge-le dupa ce confirmi ca nu le foloseste nimic. Pana atunci,
-- RLS pornit fara politici le tine blocate.
-- ---------------------------------------------------------------------------
alter table counters          enable row level security;
drop policy if exists "counters_authenticated" on counters;  -- politica slaba, scoasa
alter table service_categories enable row level security;
-- drop table if exists counters;
-- drop table if exists service_categories;
