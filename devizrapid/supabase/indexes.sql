-- ============================================================================
-- Indexuri pentru interogarile de pe calea critica.
-- De rulat O DATA in Supabase (SQL Editor). Se poate rerula fara efect.
--
-- PROBLEMA (gasita la audit, M15): fiecare tabel avea doar cheia primara. Toate
-- interogarile de mai jos filtreaza pe `user_id` + `created_at` sau pe o cheie
-- straina — niciuna nu era indexata. Cu putine randuri Postgres citeste tot
-- tabelul si nu se vede nimic; costul creste insa cu numarul TOTAL de randuri
-- din tabel, nu cu cate are userul. Adica: cu cat aplicatia are mai multi
-- clienti, cu atat devine mai lenta pentru FIECARE dintre ei, inclusiv pentru
-- cei care abia s-au inscris. Tabelele partajate (api_usage, invoice_scan_logs,
-- product_box_ratios) sunt cele mai expuse: acolo se scrie la fiecare apel.
--
-- Momentul potrivit e ACUM, cat tabelele sunt mici: crearea e instantanee si nu
-- blocheaza pe nimeni. Pe un tabel deja mare, `create index` ii tine lacatul si
-- opreste scrierile — atunci se foloseste `create index concurrently` (care NU
-- merge intr-o tranzactie, deci se ruleaza singur, o instructiune odata).
-- ============================================================================

-- --- Contorizarea apelurilor: lib/rateLimit.ts allowDaily() ----------------
-- Se citeste SI se scrie la fiecare apel AI. Tabel comun tuturor userilor.
create index if not exists api_usage_lookup
  on api_usage (user_id, endpoint, created_at desc);

-- --- Contorul de scanari: app/api/parse-invoice allowScan() ----------------
create index if not exists invoice_scan_logs_lookup
  on invoice_scan_logs (user_id, created_at desc);

-- --- Consumul lunar: lib/usage.ts -----------------------------------------
-- getMonthlyFise() ruleaza la fiecare deschidere de dashboard si inainte de
-- fiecare fisa noua; getMonthlyCalcule() la fiecare calcul.
create index if not exists quotes_user_created
  on quotes (user_id, created_at desc);

create index if not exists pricing_usage_lookup
  on pricing_usage (user_id, created_at desc);

-- --- Numerotarea fiselor: lib/quoteNumber.ts ------------------------------
-- Varianta pe firma (`company_id`) a aceleiasi interogari. Partial: randurile
-- fara firma sunt acoperite de `quotes_user_created` de mai sus.
create index if not exists quotes_company_created
  on quotes (company_id, created_at desc)
  where company_id is not null;

-- --- Cheia straina catre fisa: app/quotes/[id] + stergerea in cascada ------
-- Postgres NU indexeaza automat coloanele de cheie straina. Fara acest index,
-- fiecare deschidere de fisa si fiecare stergere de fisa scaneaza TOATE liniile
-- din sistem.
create index if not exists quote_items_quote
  on quote_items (quote_id);

-- --- Listele din meniu ----------------------------------------------------
create index if not exists clients_user        on clients (user_id);
create index if not exists services_user       on services (user_id);
create index if not exists companies_user      on companies (user_id);
create index if not exists pricing_drafts_user on pricing_drafts (user_id, updated_at desc);

-- --- Anti-abuz la re-inregistrare: app/api/delete-account -----------------
-- Cautare pe egalitate, deci si un index unic ar merge; unic ar si preveni
-- dublurile, dar codul verifica deja inainte de insert, iar un unic ar face
-- insertul sa arunce daca cele doua apeluri se suprapun. Ramane simplu.
create index if not exists deleted_accounts_hash
  on deleted_accounts (email_hash);

-- --- Raporturile cutie/bucata: app/api/parse-invoice getKnownRatios() -----
-- Aici interogarea e `ilike`, iar un index B-tree obisnuit NU poate fi folosit
-- de `ilike` (nici macar fara `%`), fiindca ordinea B-tree e sensibila la
-- majuscule. pg_trgm construieste un index pe trigrame, pe care planificatorul
-- il POATE folosi pentru `ilike`. Tabelul e partajat de toti userii si e citit
-- la fiecare scanare de factura, deci e cel mai expus la crestere.
create extension if not exists pg_trgm;
create index if not exists product_box_ratios_supplier_trgm
  on product_box_ratios using gin (supplier_name gin_trgm_ops);

-- --- profiles.canonical_email: /api/check-signup + /api/admin/lifetime ----
-- NU se creeaza aici. Cele doua rute nu interogheaza tabelul `profiles`, ci
-- parcurg `auth.users` prin `listUsers()` — un index pe `profiles` nu le-ar
-- ajuta cu nimic. Mutarea cautarii pe o coloana indexata din `profiles` e o
-- schimbare de cod, notata in docs/ROADMAP.md.

-- ---------------------------------------------------------------------------
-- Verificare (ruleaza dupa si citeste rezultatul)
-- ---------------------------------------------------------------------------
select tablename, indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in (
     'api_usage_lookup', 'invoice_scan_logs_lookup', 'quotes_user_created',
     'pricing_usage_lookup', 'quotes_company_created', 'quote_items_quote',
     'clients_user', 'services_user', 'companies_user', 'pricing_drafts_user',
     'deleted_accounts_hash', 'product_box_ratios_supplier_trgm')
 order by tablename, indexname;
-- Se asteapta 13 randuri.
