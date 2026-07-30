begin;

create table if not exists public.establishment_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  establishment_name text not null default '',
  manager_name text not null default '',
  phone text not null default '',
  email text not null default '',
  locations jsonb not null default '[]'::jsonb check (jsonb_typeof(locations) = 'array'),
  sms_template text not null default 'Easy Replace — Remplacement disponible le {date} de {debut} à {fin} à {etablissement} pour un cours de {cours}. Contact : {responsable} au {telephone}. {commentaire}',
  urgency_hours integer not null default 24 check (urgency_hours between 1 and 168),
  logo_url text,
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.establishment_settings enable row level security;

drop policy if exists "settings_select_own" on public.establishment_settings;
create policy "settings_select_own" on public.establishment_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "settings_insert_own" on public.establishment_settings;
create policy "settings_insert_own" on public.establishment_settings for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "settings_update_own" on public.establishment_settings;
create policy "settings_update_own" on public.establishment_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "settings_delete_own" on public.establishment_settings;
create policy "settings_delete_own" on public.establishment_settings for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists establishment_settings_set_updated_at on public.establishment_settings;
create trigger establishment_settings_set_updated_at before update on public.establishment_settings
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('establishment-logos', 'establishment-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "logos_insert_own_folder" on storage.objects;
create policy "logos_insert_own_folder" on storage.objects for insert to authenticated
with check (bucket_id = 'establishment-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "logos_update_own_folder" on storage.objects;
create policy "logos_update_own_folder" on storage.objects for update to authenticated
using (bucket_id = 'establishment-logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'establishment-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "logos_delete_own_folder" on storage.objects;
create policy "logos_delete_own_folder" on storage.objects for delete to authenticated
using (bucket_id = 'establishment-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- La clôture automatique utilise le fuseau horaire configuré pour chaque établissement.
create or replace function public.replacement_end_at(
  replacement_day date,
  replacement_end time without time zone,
  owner_id uuid
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (replacement_day + replacement_end) at time zone coalesce(
    (select timezone from public.establishment_settings where user_id = owner_id),
    'Europe/Paris'
  );
$$;

create or replace function public.normalize_replacement_request_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  end_at timestamptz;
begin
  end_at := public.replacement_end_at(new.replacement_date, new.end_time, new.user_id);

  if new.status = 'cancelled' or new.cancelled_at is not null then
    new.status := 'cancelled';
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status = 'completed' or new.completed_at is not null or end_at <= now() then
    new.status := 'completed';
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.accepted_recipient_id is not null
     or new.accepted_coach_id is not null
     or nullif(trim(coalesce(new.accepted_coach_name, '')), '') is not null
     or new.status = 'filled' then
    new.status := 'filled';
    new.accepted_at := coalesce(new.accepted_at, now());
  elsif new.status not in ('draft', 'sent') then
    new.status := 'draft';
  end if;
  return new;
end;
$$;

create or replace function public.synchronize_replacement_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  changed integer := 0;
begin
  update public.replacement_requests rq
    set status = 'completed', completed_at = coalesce(rq.completed_at, now())
    where rq.archived_at is null
      and rq.status not in ('cancelled', 'completed')
      and public.replacement_end_at(rq.replacement_date, rq.end_time, rq.user_id) <= now();
  get diagnostics changed = row_count;
  affected := affected + changed;

  update public.replacement_requests rq
    set status = 'filled', accepted_at = coalesce(rq.accepted_at, now())
    where rq.archived_at is null
      and rq.status in ('draft', 'sent')
      and public.replacement_end_at(rq.replacement_date, rq.end_time, rq.user_id) > now()
      and (rq.accepted_recipient_id is not null or rq.accepted_coach_id is not null
        or nullif(trim(coalesce(rq.accepted_coach_name, '')), '') is not null
        or exists (select 1 from public.replacement_recipients rr where rr.replacement_id = rq.id and rr.response_status = 'accepted'));
  get diagnostics changed = row_count;
  affected := affected + changed;

  update public.replacement_requests rq
    set status = 'cancelled', cancelled_at = coalesce(rq.cancelled_at, now())
    where rq.cancelled_at is not null and rq.status <> 'cancelled';
  get diagnostics changed = row_count;
  affected := affected + changed;
  return affected;
end;
$$;

commit;
