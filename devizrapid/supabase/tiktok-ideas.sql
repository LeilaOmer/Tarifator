-- ============================================================================
-- Tabelul `tiktok_ideas` — istoricul continutului generat de agentul TikTok.
-- De rulat O DATA in Supabase (SQL Editor).
--
-- Salvam METADATE, nu doar text: content_type + goal (doua axe SEPARATE, vezi
-- ADR-026), tema, model si data. Alaturi de coloanele de performanta (completate
-- manual dupa postare), peste 3-6 luni poti intreba ce combinatie a mers cel mai
-- bine (ex: "ce content_type x goal are cel mai bun engagement?").
--
-- Un rand = O varianta (nu tot setul). Cele 3 variante ale aceleiasi idei impart
-- acelasi set_id si aceeasi idee. Asa poti urmari performanta fiecarei variante.
-- ============================================================================

create table if not exists tiktok_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id uuid not null,               -- grupeaza cele 3 variante ale unei idei

  -- provenienta / metadate de invatare
  topic text,                         -- tema ceruta (null = agentul a ales singur)
  idea text not null,                 -- ideea comuna a setului
  content_type text not null,         -- educational | funny | controversial | story ...
  goal text not null,                 -- awareness | engagement | conversion
  model text,                         -- modelul folosit (ex: llama-3.3-70b-versatile)

  -- continutul generat
  hook text,
  script text,
  description text,
  hashtags text[] not null default '{}',
  cta text,
  video_prompt text,                  -- prompt pentru Veo/Kling/CapCut

  -- performanta (se completeaza DUPA postare, ca sa poti invata ce a mers)
  status text not null default 'draft',  -- draft | posted | archived
  posted_at timestamptz,
  tiktok_url text,
  views int,
  likes int,
  comments int,
  shares int,
  saves int,

  created_at timestamptz not null default now()
);

-- Indexuri pentru cele doua interogari principale:
--  (1) istoricul unui user, recent-intai;
--  (2) analiza "ce a mers" pe combinatia de axe.
create index if not exists tiktok_ideas_user_created_idx
  on tiktok_ideas (user_id, created_at desc);
create index if not exists tiktok_ideas_perf_idx
  on tiktok_ideas (content_type, goal);

-- RLS: fiecare user vede si isi gestioneaza DOAR propriile idei.
alter table tiktok_ideas enable row level security;

drop policy if exists "tiktok_ideas_owner_select" on tiktok_ideas;
create policy "tiktok_ideas_owner_select" on tiktok_ideas
  for select using (auth.uid() = user_id);

-- Update din client permis pe randurile proprii (ex: userul isi noteaza metricile
-- de performanta dupa ce a postat clipul).
drop policy if exists "tiktok_ideas_owner_update" on tiktok_ideas;
create policy "tiktok_ideas_owner_update" on tiktok_ideas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tiktok_ideas_owner_delete" on tiktok_ideas;
create policy "tiktok_ideas_owner_delete" on tiktok_ideas
  for delete using (auth.uid() = user_id);

-- Insert: se face din ruta API cu service-role (identitatea userului e deja
-- verificata acolo), deci NU exista politica de insert pentru useri.
