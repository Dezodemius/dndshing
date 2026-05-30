alter table public.characters
add column if not exists pdf_path text null,
add column if not exists processing_status text not null default 'lss_ready'
  check (processing_status in ('received', 'processing', 'lss_ready', 'failed')),
add column if not exists processing_steps jsonb not null default
  '{
    "receivedYandexForm": {
      "status": "completed",
      "message": null,
      "updatedAt": null
    },
    "generatingCharacter": {
      "status": "completed",
      "message": null,
      "updatedAt": null
    },
    "formingLssJson": {
      "status": "completed",
      "message": null,
      "updatedAt": null
    },
    "formingPdf": {
      "status": "failed",
      "message": "PDF generator is not implemented yet.",
      "updatedAt": null
    }
  }'::jsonb;
