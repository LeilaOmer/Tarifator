-- ============================================================================
-- Ce s-a aplicat si ce nu, din fisierele din supabase/.
-- Se poate rula oricand, de oricate ori — doar citeste.
--
-- DE CE EXISTA: fisierele de aici nu se aplica automat. Pana acum, singurul mod
-- de a sti daca unul a fost rulat era sa-ti amintesti — iar un fisier ne-rulat
-- nu da nicio eroare, doar lipseste protectia. Cel mai neplacut caz:
-- `enforce-limits.sql` ne-rulat inseamna ca DOUA fise pot primi acelasi numar,
-- fara niciun semn, pe un document dat clientului.
--
-- Coloana `stare`: OK = aplicat. LIPSA = ruleaza fisierul din coloana `fisier`.
-- ============================================================================

with gasite as (
  select 'enforce-limits.sql' as fisier, 'index unic pe numarul de fisa' as ce,
         count(*) as gasit, 1 as trebuie
    from pg_indexes
   where schemaname = 'public' and indexname = 'quotes_unique_number'

  union all
  select 'enforce-limits.sql', 'triggerele de limite (quotes + pricing_usage)',
         count(*), 2
    from pg_trigger where tgname in ('quotes_limit', 'pricing_usage_limit')

  union all
  select 'enforce-limits.sql', 'tabelul app_config (comutatorul prelaunch)',
         count(*), 1
    from information_schema.tables
   where table_schema = 'public' and table_name = 'app_config'

  union all
  select 'consents.sql', 'tabelul consents', count(*), 1
    from information_schema.tables
   where table_schema = 'public' and table_name = 'consents'

  union all
  select 'consents.sql', 'politicile RLS pe consents (insert + select)', count(*), 2
    from pg_policies where schemaname = 'public' and tablename = 'consents'

  union all
  select 'indexes.sql', 'indexurile de pe calea critica', count(*), 12
    from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'api_usage_lookup', 'invoice_scan_logs_lookup', 'quotes_user_created',
       'pricing_usage_lookup', 'quotes_company_created', 'quote_items_quote',
       'clients_user', 'services_user', 'companies_user', 'pricing_drafts_user',
       'deleted_accounts_hash', 'product_box_ratios_supplier_trgm')

  union all
  select 'ip-throttle.sql', 'tabelul ip_throttle', count(*), 1
    from information_schema.tables
   where table_schema = 'public' and table_name = 'ip_throttle'

  -- Aici se asteapta ZERO: userul NU are voie sa-si scrie singur planul.
  union all
  select 'lock-billing-columns.sql', 'coloanele de plan NEscriabile de user',
         count(*), 0
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and grantee = 'authenticated' and privilege_type = 'UPDATE'
     and column_name in ('plan_tier', 'plan_active_until', 'lifetime')
)
select fisier,
       ce,
       gasit,
       trebuie,
       case when gasit = trebuie then 'OK' else 'LIPSA' end as stare
  from gasite
 order by stare desc, fisier, ce;
