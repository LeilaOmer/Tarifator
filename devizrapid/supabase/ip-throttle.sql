-- ============================================================================
-- Tabel de throttling pe IP pentru rutele PUBLICE (pre-signup, fara user).
-- De rulat O DATA in Supabase (SQL Editor). Folosit de lib/rateLimit.ts
-- (allowDailyByIp) pe /api/check-signup, ca sa nu poata fi apelata la nesfarsit
-- de la un singur IP (enumerare de conturi / amplificare de cost).
--
-- Scris/citit DOAR prin service-role (ruta n-are user autentificat). RLS pornit
-- fara politici => blocat pentru orice token de user; service-role ocoleste RLS.
-- ============================================================================

create table if not exists ip_throttle (
  id         bigint generated always as identity primary key,
  ip         text not null,
  endpoint   text not null,
  created_at timestamptz not null default now()
);

alter table ip_throttle enable row level security;

-- Cautarea e pe (ip, endpoint, created_at >= azi) — index pe cheia de contorizare.
create index if not exists ip_throttle_lookup
  on ip_throttle (ip, endpoint, created_at);

-- Optional: curatenie periodica ca tabelul sa nu creasca la infinit. Poti rula
-- manual din cand in cand, sau programa un cron (pg_cron) daca il ai activat:
--   delete from ip_throttle where created_at < now() - interval '7 days';
