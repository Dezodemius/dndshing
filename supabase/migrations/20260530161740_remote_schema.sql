-- folders
create table if not exists public.folders (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  game_date   date,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.folders enable row level security;

drop policy if exists "folders: owner select" on public.folders;
drop policy if exists "folders: owner insert" on public.folders;
drop policy if exists "folders: owner update" on public.folders;
drop policy if exists "folders: owner delete" on public.folders;

create policy "folders: owner select" on public.folders for select using (auth.uid() = user_id);
create policy "folders: owner insert" on public.folders for insert with check (auth.uid() = user_id);
create policy "folders: owner update" on public.folders for update using (auth.uid() = user_id);
create policy "folders: owner delete" on public.folders for delete using (auth.uid() = user_id);

-- characters
create table if not exists public.characters (
  id                  uuid        primary key default gen_random_uuid(),
  folder_id           uuid        not null references public.folders(id) on delete cascade,
  player_name         text        not null,
  character_name      text        not null,
  race                text        not null,
  class               text        not null,
  level               integer     not null default 1 check (level between 1 and 20),
  gender              text,
  short_backstory     text        not null,
  appearance          text        not null,
  personality         text        not null,
  fears               text        not null,
  goals               text        not null,
  avatar_url          text,
  raw_prompt          text        not null default '',
  internal_json       jsonb       not null default '{}',
  generated_json      jsonb       not null default '{}',
  generated_json_path text,
  pdf_path            text,
  processing_status   text        not null default 'received'
                        check (processing_status in ('received', 'processing', 'lss_ready', 'failed')),
  processing_steps    jsonb       not null default '{}',
  user_id             uuid        not null references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.characters enable row level security;

drop policy if exists "characters: owner select" on public.characters;
drop policy if exists "characters: owner insert" on public.characters;
drop policy if exists "characters: owner update" on public.characters;
drop policy if exists "characters: owner delete" on public.characters;

create policy "characters: owner select" on public.characters for select using (auth.uid() = user_id);
create policy "characters: owner insert" on public.characters for insert with check (auth.uid() = user_id);
create policy "characters: owner update" on public.characters for update using (auth.uid() = user_id);
create policy "characters: owner delete" on public.characters for delete using (auth.uid() = user_id);

-- user_ai_settings
create table if not exists public.user_ai_settings (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  api_base_url text        not null,
  api_key      text        not null,
  model_name   text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;

drop policy if exists "ai_settings: owner select" on public.user_ai_settings;
drop policy if exists "ai_settings: owner insert" on public.user_ai_settings;
drop policy if exists "ai_settings: owner update" on public.user_ai_settings;
drop policy if exists "ai_settings: owner delete" on public.user_ai_settings;

create policy "ai_settings: owner select" on public.user_ai_settings for select using (auth.uid() = user_id);
create policy "ai_settings: owner insert" on public.user_ai_settings for insert with check (auth.uid() = user_id);
create policy "ai_settings: owner update" on public.user_ai_settings for update using (auth.uid() = user_id);
create policy "ai_settings: owner delete" on public.user_ai_settings for delete using (auth.uid() = user_id);

-- Storage bucket for generated character JSON files (private, 5 MB limit)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-json', 'character-json', false, 5242880, array['application/json'])
on conflict (id) do nothing;

drop policy if exists "character-json: owner read" on storage.objects;
drop policy if exists "character-json: service write" on storage.objects;

create policy "character-json: owner read"
  on storage.objects for select
  using (bucket_id = 'character-json' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "character-json: service write"
  on storage.objects for all
  using (bucket_id = 'character-json')
  with check (bucket_id = 'character-json');
