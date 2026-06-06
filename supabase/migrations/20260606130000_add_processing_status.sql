alter table public.characters
  add column if not exists processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'lss_ready', 'failed'));
