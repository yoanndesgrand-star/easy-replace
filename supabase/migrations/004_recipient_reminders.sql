begin;

alter table public.replacement_recipients
  add column if not exists reminder_count integer not null default 0 check (reminder_count >= 0),
  add column if not exists last_reminded_at timestamptz;

commit;
