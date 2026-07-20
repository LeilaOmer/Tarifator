-- ============================================================================
-- Adauga axa `platform` la tabelul EXISTENT tiktok_ideas (ADR-027).
-- De rulat O DATA in Supabase (SQL Editor) — DOAR daca ai rulat deja
-- tiktok-ideas.sql inainte de a exista coloana platform.
-- (Pe un tabel nou creat cu tiktok-ideas.sql actualizat, coloana exista deja
--  si acest script nu are nimic de facut — e sigur sa-l rulezi oricum.)
--
-- Acelasi format (video vertical scurt) pe toate platformele, dar hashtagurile,
-- caption-ul, link-ul si CTA-ul difera. Salvarea platformei per rand permite
-- analiza "ce platforma x content_type x goal a mers".
-- ============================================================================

alter table tiktok_ideas
  add column if not exists platform text not null default 'tiktok';

-- Indexul de performanta include acum platforma. Il refacem (drop + create) ca
-- sa treaca de la (content_type, goal) la (platform, content_type, goal).
drop index if exists tiktok_ideas_perf_idx;
create index if not exists tiktok_ideas_perf_idx
  on tiktok_ideas (platform, content_type, goal);
