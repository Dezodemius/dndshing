create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text null check (description is null or char_length(description) <= 1000),
  game_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade
);

create index folders_user_id_created_at_idx on public.folders (user_id, created_at desc);

create trigger folders_set_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

alter table public.folders enable row level security;

create policy "folders_select_own"
on public.folders for select
to authenticated
using (auth.uid() = user_id);

create policy "folders_insert_own"
on public.folders for insert
to authenticated
with check (auth.uid() = user_id);

create policy "folders_update_own"
on public.folders for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "folders_delete_own"
on public.folders for delete
to authenticated
using (auth.uid() = user_id);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 120),
  character_name text not null check (char_length(character_name) between 1 and 120),
  race text not null check (char_length(race) between 1 and 80),
  class text not null check (char_length(class) between 1 and 80),
  level integer not null check (level between 1 and 20),
  gender text null check (gender is null or char_length(gender) <= 80),
  short_backstory text not null,
  appearance text not null,
  personality text not null,
  fears text not null,
  goals text not null,
  avatar_url text null,
  raw_prompt text not null,
  internal_json jsonb not null,
  generated_json jsonb not null,
  generated_json_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade
);

create index characters_user_id_folder_id_created_at_idx
on public.characters (user_id, folder_id, created_at desc);

create trigger characters_set_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

alter table public.characters enable row level security;

create policy "characters_select_own"
on public.characters for select
to authenticated
using (auth.uid() = user_id);

create policy "characters_insert_own"
on public.characters for insert
to authenticated
with check (auth.uid() = user_id);

create policy "characters_update_own"
on public.characters for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "characters_delete_own"
on public.characters for delete
to authenticated
using (auth.uid() = user_id);

create table public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_base_url text not null,
  api_key text not null,
  model_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_ai_settings_set_updated_at
before update on public.user_ai_settings
for each row execute function public.set_updated_at();

alter table public.user_ai_settings enable row level security;

create policy "user_ai_settings_select_own"
on public.user_ai_settings for select
to authenticated
using (auth.uid() = user_id);

create policy "user_ai_settings_insert_own"
on public.user_ai_settings for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_ai_settings_update_own"
on public.user_ai_settings for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-json', 'character-json', false, 1048576, array['application/json'])
on conflict (id) do nothing;

create policy "character_json_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'character-json'
  and (storage.foldername(name))[1] = auth.uid()::text
);
