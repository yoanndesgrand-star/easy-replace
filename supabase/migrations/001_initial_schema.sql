begin;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coaches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null,
  normalized_phone text not null check (normalized_phone ~ '^[0-9]{10,15}$'),
  email text,
  specialties text[] not null default '{}',
  location text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.replacement_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue text not null,
  address text,
  replacement_date date not null,
  start_time time not null,
  end_time time not null,
  class_type text not null,
  required_specialty text not null,
  manager_name text not null,
  manager_phone text not null,
  message text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'filled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.replacement_recipients (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacement_requests(id) on delete cascade,
  coach_id uuid references public.coaches(id) on delete set null,
  phone_snapshot text not null check (phone_snapshot ~ '^[0-9]{10,15}$'),
  coach_name_snapshot text not null,
  sms_status text not null default 'pending' check (sms_status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (replacement_id, coach_id)
);

create index coaches_user_id_idx on public.coaches(user_id);
create index replacement_requests_user_id_created_at_idx on public.replacement_requests(user_id, created_at desc);
create index replacement_recipients_replacement_id_idx on public.replacement_recipients(replacement_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger coaches_set_updated_at before update on public.coaches
for each row execute function public.set_updated_at();
create trigger replacement_requests_set_updated_at before update on public.replacement_requests
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, first_name, last_name, full_name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      trim(concat(new.raw_user_meta_data ->> 'first_name', ' ', new.raw_user_meta_data ->> 'last_name'))
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.coaches enable row level security;
alter table public.replacement_requests enable row level security;
alter table public.replacement_recipients enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "coaches_select_own" on public.coaches for select to authenticated using ((select auth.uid()) = user_id);
create policy "coaches_insert_own" on public.coaches for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "coaches_update_own" on public.coaches for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "coaches_delete_own" on public.coaches for delete to authenticated using ((select auth.uid()) = user_id);

create policy "requests_select_own" on public.replacement_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "requests_insert_own" on public.replacement_requests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "requests_update_own" on public.replacement_requests for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "requests_delete_own" on public.replacement_requests for delete to authenticated using ((select auth.uid()) = user_id);

create policy "recipients_select_via_parent" on public.replacement_recipients for select to authenticated
using (exists (select 1 from public.replacement_requests r where r.id = replacement_id and r.user_id = (select auth.uid())));
create policy "recipients_insert_via_parent" on public.replacement_recipients for insert to authenticated
with check (exists (select 1 from public.replacement_requests r where r.id = replacement_id and r.user_id = (select auth.uid())));
create policy "recipients_update_via_parent" on public.replacement_recipients for update to authenticated
using (exists (select 1 from public.replacement_requests r where r.id = replacement_id and r.user_id = (select auth.uid())))
with check (exists (select 1 from public.replacement_requests r where r.id = replacement_id and r.user_id = (select auth.uid())));
create policy "recipients_delete_via_parent" on public.replacement_recipients for delete to authenticated
using (exists (select 1 from public.replacement_requests r where r.id = replacement_id and r.user_id = (select auth.uid())));

commit;
