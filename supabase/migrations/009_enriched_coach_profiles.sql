begin;

alter table public.coaches
  add column if not exists available_days text[] not null default '{}',
  add column if not exists archived_at timestamptz;

create index if not exists coaches_user_archived_idx
  on public.coaches(user_id, archived_at, last_name);

-- An archived coach remains in history, but can no longer receive a new request.
update public.coaches
set is_active = false
where archived_at is not null and is_active = true;

commit;
