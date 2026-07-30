begin;

create extension if not exists pgcrypto;

-- ============================================================
-- Easy Replace SaaS foundation: organizations and memberships
-- ============================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email text,
  phone text,
  address text,
  timezone text not null default 'Europe/Paris',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 1 and 160),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'manager')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create unique index if not exists organization_users_one_owner_per_user_idx
  on public.organization_users(user_id)
  where role = 'owner';
create index if not exists organization_users_user_id_idx on public.organization_users(user_id);

create or replace function public.slugify_organization_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(value, ''),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
      'aaaaaaceeeeiiiinooooouuuuyyoea')),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create or replace function public.unique_organization_slug(base_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text := nullif(public.slugify_organization_name(base_name), '');
  candidate text;
  suffix integer := 1;
begin
  base_slug := coalesce(base_slug, 'etablissement');
  candidate := base_slug;
  while exists (select 1 from public.organizations where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix::text;
  end loop;
  return candidate;
end;
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_users ou
    where ou.organization_id = target_organization_id
      and ou.user_id = auth.uid()
  );
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ou.organization_id
  from public.organization_users ou
  where ou.user_id = auth.uid()
  order by case ou.role when 'owner' then 0 when 'admin' then 1 else 2 end, ou.created_at
  limit 1;
$$;

-- Commercial tables prepared now; Stripe is connected in a later phase.
create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  annual_price_cents integer check (annual_price_cents is null or annual_price_cents >= 0),
  included_sms integer not null check (included_sms >= 0),
  max_locations integer,
  max_admins integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.subscription_plans (id, name, monthly_price_cents, annual_price_cents, included_sms, max_locations, max_admins, sort_order)
values
  ('discovery', 'Découverte', 0, null, 20, 1, 1, 10),
  ('essential', 'Essentiel', 2900, 29000, 100, 2, 1, 20),
  ('pro', 'Pro', 5900, 59000, 300, 5, 3, 30),
  ('network', 'Réseau', 9900, 99000, 700, null, 10, 40)
on conflict (id) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  annual_price_cents = excluded.annual_price_cents,
  included_sms = excluded.included_sms,
  max_locations = excluded.max_locations,
  max_admins = excluded.max_admins,
  sort_order = excluded.sort_order;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('active', 'past_due', 'suspended', 'cancelled')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annual')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '1 month'),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add tenant ownership to all current business tables.
alter table public.profiles add column if not exists default_organization_id uuid references public.organizations(id) on delete set null;
alter table public.coaches add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.replacement_requests add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.replacement_recipients add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.locations add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.coach_locations add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.establishment_settings add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- One organization is created for each existing owner account, preserving every record.
do $$
declare
  u record;
  org_id uuid;
  org_name text;
  org_slug text;
  settings_row record;
begin
  for u in select id, email, raw_user_meta_data from auth.users loop
    select ou.organization_id into org_id
    from public.organization_users ou
    where ou.user_id = u.id
    order by ou.created_at
    limit 1;

    if org_id is null then
      select * into settings_row from public.establishment_settings where user_id = u.id limit 1;
      org_name := coalesce(
        nullif(trim(settings_row.establishment_name), ''),
        nullif(trim(u.raw_user_meta_data ->> 'establishment_name'), ''),
        nullif(trim(concat(u.raw_user_meta_data ->> 'first_name', ' ', u.raw_user_meta_data ->> 'last_name')), ''),
        split_part(coalesce(u.email, 'etablissement'), '@', 1),
        'Établissement'
      );
      org_slug := public.unique_organization_slug(org_name);

      insert into public.organizations (name, slug, email, phone, timezone, logo_url)
      values (
        org_name,
        org_slug,
        coalesce(nullif(trim(settings_row.email), ''), u.email),
        nullif(trim(settings_row.phone), ''),
        coalesce(nullif(trim(settings_row.timezone), ''), 'Europe/Paris'),
        settings_row.logo_url
      ) returning id into org_id;

      insert into public.organization_users (organization_id, user_id, role)
      values (org_id, u.id, 'owner')
      on conflict do nothing;
    end if;

    update public.profiles set default_organization_id = org_id where id = u.id and default_organization_id is null;
    update public.coaches set organization_id = org_id where user_id = u.id and organization_id is null;
    update public.replacement_requests set organization_id = org_id where user_id = u.id and organization_id is null;
    update public.locations set organization_id = org_id where user_id = u.id and organization_id is null;
    update public.establishment_settings set organization_id = org_id where user_id = u.id and organization_id is null;

    insert into public.subscriptions (organization_id, plan_id, status)
    values (org_id, 'discovery', 'active')
    on conflict (organization_id) do nothing;
  end loop;
end $$;

update public.replacement_recipients rr
set organization_id = rq.organization_id
from public.replacement_requests rq
where rr.replacement_id = rq.id and rr.organization_id is null;

update public.coach_locations cl
set organization_id = c.organization_id
from public.coaches c
where cl.coach_id = c.id and cl.organization_id is null;

-- Existing rows are now fully tenant-owned.
alter table public.coaches alter column organization_id set not null;
alter table public.replacement_requests alter column organization_id set not null;
alter table public.replacement_recipients alter column organization_id set not null;
alter table public.locations alter column organization_id set not null;
alter table public.coach_locations alter column organization_id set not null;
alter table public.establishment_settings alter column organization_id set not null;

create index if not exists coaches_organization_id_idx on public.coaches(organization_id);
create index if not exists requests_organization_created_idx on public.replacement_requests(organization_id, created_at desc);
create index if not exists recipients_organization_idx on public.replacement_recipients(organization_id);
create index if not exists locations_organization_idx on public.locations(organization_id);
create unique index if not exists establishment_settings_organization_unique_idx on public.establishment_settings(organization_id);

-- Automatic tenant assignment keeps the client code simple and prevents forged ownership.
create or replace function public.assign_current_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid;
begin
  current_org := public.current_organization_id();
  if current_org is null then
    raise exception 'Aucune organisation associée à cet utilisateur.' using errcode = '42501';
  end if;
  new.organization_id := current_org;
  return new;
end;
$$;

create or replace function public.assign_parent_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'replacement_recipients' then
    select organization_id into new.organization_id from public.replacement_requests where id = new.replacement_id;
  elsif tg_table_name = 'coach_locations' then
    select organization_id into new.organization_id from public.coaches where id = new.coach_id;
    if new.organization_id is distinct from (select organization_id from public.locations where id = new.location_id) then
      raise exception 'Le coach et la salle doivent appartenir au même établissement.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists coaches_assign_organization on public.coaches;
create trigger coaches_assign_organization before insert on public.coaches for each row execute function public.assign_current_organization();
drop trigger if exists requests_assign_organization on public.replacement_requests;
create trigger requests_assign_organization before insert on public.replacement_requests for each row execute function public.assign_current_organization();
drop trigger if exists locations_assign_organization on public.locations;
create trigger locations_assign_organization before insert on public.locations for each row execute function public.assign_current_organization();
drop trigger if exists settings_assign_organization on public.establishment_settings;
create trigger settings_assign_organization before insert on public.establishment_settings for each row execute function public.assign_current_organization();
drop trigger if exists recipients_assign_organization on public.replacement_recipients;
create trigger recipients_assign_organization before insert or update of replacement_id on public.replacement_recipients for each row execute function public.assign_parent_organization();
drop trigger if exists coach_locations_assign_organization on public.coach_locations;
create trigger coach_locations_assign_organization before insert or update of coach_id, location_id on public.coach_locations for each row execute function public.assign_parent_organization();

-- Upgrade the authentication trigger: every new account receives an organization and the free plan.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  org_name text;
  org_slug text;
  first_name_value text;
  last_name_value text;
begin
  first_name_value := nullif(trim(new.raw_user_meta_data ->> 'first_name'), '');
  last_name_value := nullif(trim(new.raw_user_meta_data ->> 'last_name'), '');
  org_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'establishment_name'), ''),
    nullif(trim(concat(first_name_value, ' ', last_name_value)), ''),
    split_part(coalesce(new.email, 'etablissement'), '@', 1),
    'Établissement'
  );
  org_slug := public.unique_organization_slug(org_name);

  insert into public.organizations (name, slug, email)
  values (org_name, org_slug, new.email)
  returning id into org_id;

  insert into public.organization_users (organization_id, user_id, role)
  values (org_id, new.id, 'owner');

  insert into public.profiles (id, first_name, last_name, full_name, default_organization_id)
  values (
    new.id,
    first_name_value,
    last_name_value,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), trim(concat(first_name_value, ' ', last_name_value))),
    org_id
  );

  insert into public.establishment_settings (
    user_id, organization_id, establishment_name, manager_name, email, timezone
  ) values (
    new.id, org_id, org_name, trim(concat(first_name_value, ' ', last_name_value)), coalesce(new.email, ''), 'Europe/Paris'
  );

  insert into public.subscriptions (organization_id, plan_id, status)
  values (org_id, 'discovery', 'active');

  return new;
end;
$$;

-- Bootstrap RPC repairs accounts created during an interrupted deployment.
create or replace function public.ensure_my_organization()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  org_id uuid;
  user_row auth.users%rowtype;
  org_name text;
begin
  if uid is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  select organization_id into org_id from public.organization_users where user_id = uid order by created_at limit 1;
  if org_id is not null then return org_id; end if;

  select * into user_row from auth.users where id = uid;
  org_name := coalesce(nullif(trim(user_row.raw_user_meta_data ->> 'establishment_name'), ''), split_part(user_row.email, '@', 1), 'Établissement');
  insert into public.organizations (name, slug, email)
    values (org_name, public.unique_organization_slug(org_name), user_row.email)
    returning id into org_id;
  insert into public.organization_users (organization_id, user_id, role) values (org_id, uid, 'owner');
  update public.profiles set default_organization_id = org_id where id = uid;
  insert into public.establishment_settings (user_id, organization_id, establishment_name, email)
    values (uid, org_id, org_name, coalesce(user_row.email, '')) on conflict (organization_id) do nothing;
  insert into public.subscriptions (organization_id, plan_id) values (org_id, 'discovery') on conflict (organization_id) do nothing;
  return org_id;
end;
$$;

-- RLS: membership, never a raw authenticated-user check.
alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;

create policy "plans_read_authenticated" on public.subscription_plans for select to authenticated using (is_active = true);
create policy "organizations_select_member" on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy "organizations_update_owner_admin" on public.organizations for update to authenticated
using (exists (select 1 from public.organization_users ou where ou.organization_id = id and ou.user_id = auth.uid() and ou.role in ('owner','admin')))
with check (exists (select 1 from public.organization_users ou where ou.organization_id = id and ou.user_id = auth.uid() and ou.role in ('owner','admin')));
create policy "organization_users_select_member" on public.organization_users for select to authenticated using (public.is_organization_member(organization_id));
create policy "subscriptions_select_member" on public.subscriptions for select to authenticated using (public.is_organization_member(organization_id));

-- Replace prior owner-user policies on business tables.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('coaches','replacement_requests','replacement_recipients','locations','coach_locations','establishment_settings')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "coaches_tenant_all" on public.coaches for all to authenticated
using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "requests_tenant_all" on public.replacement_requests for all to authenticated
using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "recipients_tenant_all" on public.replacement_recipients for all to authenticated
using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "locations_tenant_all" on public.locations for all to authenticated
using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "coach_locations_tenant_all" on public.coach_locations for all to authenticated
using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "settings_tenant_all" on public.establishment_settings for all to authenticated
using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));

-- Keep public response RPCs available; direct anonymous table access remains disabled.
grant execute on function public.ensure_my_organization() to authenticated;
grant execute on function public.current_organization_id() to authenticated;

-- Logo paths are now organization-based. Existing user folders remain readable because the bucket is public.
drop policy if exists "logos_insert_own_folder" on storage.objects;
drop policy if exists "logos_update_own_folder" on storage.objects;
drop policy if exists "logos_delete_own_folder" on storage.objects;
create policy "logos_insert_organization_folder" on storage.objects for insert to authenticated
with check (bucket_id = 'establishment-logos' and public.is_organization_member(((storage.foldername(name))[1])::uuid));
create policy "logos_update_organization_folder" on storage.objects for update to authenticated
using (bucket_id = 'establishment-logos' and public.is_organization_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'establishment-logos' and public.is_organization_member(((storage.foldername(name))[1])::uuid));
create policy "logos_delete_organization_folder" on storage.objects for delete to authenticated
using (bucket_id = 'establishment-logos' and public.is_organization_member(((storage.foldername(name))[1])::uuid));

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

commit;
