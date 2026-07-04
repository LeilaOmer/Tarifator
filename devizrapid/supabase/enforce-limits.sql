-- ============================================================================
-- Impunerea limitelor de abonament in BAZA DE DATE (nu doar in UI).
-- De rulat O DATA in Supabase (SQL Editor). Fara asta, limitele sunt doar in
-- client si pot fi ocolite de un user tehnic cu propriul token.
--
-- Regulile oglindesc lib/plan.ts / BUSINESS_RULES.md cap. 5 — daca schimbi
-- limitele acolo, schimba-le si aici.
-- ============================================================================

-- 1) Config global. Comutatorul de lansare traieste AICI (o singura parghie):
--    la lansare rulezi: update app_config set value = 'false' where key = 'prelaunch';
--    UI-ul (lib/plan.ts) si triggerele citesc amandoua din acest tabel.
create table if not exists app_config (
  key text primary key,
  value jsonb not null
);
alter table app_config enable row level security;
drop policy if exists "app_config_read" on app_config;
create policy "app_config_read" on app_config for select using (true);
-- scriere: doar service-role (nicio politica de insert/update)

insert into app_config (key, value) values ('prelaunch', 'true'::jsonb)
  on conflict (key) do nothing;

-- 2) Functia de limitare, comuna pentru fise si calcule.
create or replace function enforce_monthly_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prelaunch boolean;
  v_lifetime  boolean;
  v_tier      text;
  v_until     timestamptz;
  v_created   timestamptz;
  v_limit     int;   -- null = nelimitat
  v_count     int;
  v_kind      text := tg_argv[0];  -- 'fise' | 'calcule'
begin
  -- pre-lansare: totul liber
  select (value #>> '{}')::boolean into v_prelaunch from app_config where key = 'prelaunch';
  if coalesce(v_prelaunch, true) then return new; end if;

  select coalesce(lifetime, false), plan_tier, plan_active_until
    into v_lifetime, v_tier, v_until
    from profiles where id = new.user_id;
  if v_lifetime then return new; end if;

  -- abonamentul platit conteaza doar daca e activ
  if v_until is null or v_until <= now() or v_tier is null then
    v_tier := 'free';
  end if;

  -- limitele pe module (oglinda TIER_LIMITS din lib/plan.ts)
  if v_kind = 'fise' then
    v_limit := case v_tier when 'artizan' then null when 'pro' then null else 3 end;
  else
    v_limit := case v_tier when 'mercator' then null when 'pro' then null else 3 end;
  end if;

  -- freemium: primele 30 de zile pe Free => 30 in loc de 3
  if v_tier = 'free' or v_tier not in ('artizan','mercator','pro') then
    select created_at into v_created from auth.users where id = new.user_id;
    if v_created is not null and v_created > now() - interval '30 days' then
      v_limit := 30;
    end if;
  end if;

  if v_limit is null then return new; end if;

  if v_kind = 'fise' then
    select count(*) into v_count from quotes
      where user_id = new.user_id and created_at >= date_trunc('month', now());
  else
    select count(*) into v_count from pricing_usage
      where user_id = new.user_id and created_at >= date_trunc('month', now());
  end if;

  if v_count >= v_limit then
    raise exception 'Limita lunara a planului tau a fost atinsa (%/%). Treci pe un plan superior din pagina Upgrade.', v_count, v_limit;
  end if;
  return new;
end $$;

drop trigger if exists quotes_limit on quotes;
create trigger quotes_limit before insert on quotes
  for each row execute function enforce_monthly_limit('fise');

drop trigger if exists pricing_usage_limit on pricing_usage;
create trigger pricing_usage_limit before insert on pricing_usage
  for each row execute function enforce_monthly_limit('calcule');

-- 3) Numar de fisa unic per user + firma + numar: doua fise create simultan
--    nu mai pot primi tacut acelasi numar — a doua inserare esueaza vizibil.
create unique index if not exists quotes_unique_number
  on quotes (user_id, coalesce(company_id::text, ''), quote_number);
