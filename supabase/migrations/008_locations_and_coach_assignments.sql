begin;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.coach_locations (
  coach_id uuid not null references public.coaches(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (coach_id, location_id)
);

alter table public.replacement_requests add column if not exists location_id uuid references public.locations(id) on delete set null;

alter table public.locations enable row level security;
alter table public.coach_locations enable row level security;

drop policy if exists "locations_select_own" on public.locations;
create policy "locations_select_own" on public.locations for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "locations_insert_own" on public.locations;
create policy "locations_insert_own" on public.locations for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "locations_update_own" on public.locations;
create policy "locations_update_own" on public.locations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "locations_delete_own" on public.locations;
create policy "locations_delete_own" on public.locations for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "coach_locations_select_own" on public.coach_locations;
create policy "coach_locations_select_own" on public.coach_locations for select to authenticated using (
  exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid()))
);
drop policy if exists "coach_locations_insert_own" on public.coach_locations;
create policy "coach_locations_insert_own" on public.coach_locations for insert to authenticated with check (
  exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid()))
  and exists (select 1 from public.locations l where l.id = location_id and l.user_id = (select auth.uid()))
);
drop policy if exists "coach_locations_update_own" on public.coach_locations;
create policy "coach_locations_update_own" on public.coach_locations for update to authenticated using (
  exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid()))
  and exists (select 1 from public.locations l where l.id = location_id and l.user_id = (select auth.uid()))
);
drop policy if exists "coach_locations_delete_own" on public.coach_locations;
create policy "coach_locations_delete_own" on public.coach_locations for delete to authenticated using (
  exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = (select auth.uid()))
);

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at before update on public.locations for each row execute function public.set_updated_at();

-- Reprend automatiquement les salles déjà enregistrées dans les paramètres.
insert into public.locations (user_id, name, address)
select s.user_id, trim(item->>'name'), coalesce(trim(item->>'address'), '')
from public.establishment_settings s
cross join lateral jsonb_array_elements(coalesce(s.locations, '[]'::jsonb)) item
where nullif(trim(item->>'name'), '') is not null
on conflict (user_id, name) do update set address = excluded.address;

-- Associe les demandes existantes à une salle lorsque le nom correspond.
update public.replacement_requests r
set location_id = l.id
from public.locations l
where r.location_id is null and l.user_id = r.user_id and lower(trim(l.name)) = lower(trim(r.venue));

commit;
