alter table public.characters add column if not exists pdf_path text;
alter table public.characters add column if not exists generated_json_path text;
alter table public.characters add column if not exists avatar_url text;
alter table public.characters add column if not exists raw_prompt text not null default '';
alter table public.characters add column if not exists internal_json jsonb not null default '{}';
alter table public.characters add column if not exists generated_json jsonb not null default '{}';
alter table public.characters add column if not exists processing_steps jsonb not null default '{}';
