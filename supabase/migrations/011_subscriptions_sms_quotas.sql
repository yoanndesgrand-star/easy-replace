-- Phase 6.2 + 6.3 — abonnements, quotas et consommation SMS
begin;

alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists grace_period_end timestamptz;

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  event_type text not null check (event_type in ('created','renewed','plan_changed','status_changed','pack_added','manual_adjustment')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sms_credit_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchased_segments integer not null check (purchased_segments > 0),
  remaining_segments integer not null check (remaining_segments >= 0),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  stripe_payment_intent_id text unique,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sms_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  replacement_id uuid references public.replacement_requests(id) on delete set null,
  recipient_id uuid references public.replacement_recipients(id) on delete set null,
  message_type text not null check (message_type in ('initial','reminder','admin_notification','manual')),
  status text not null default 'reserved' check (status in ('reserved','sent','failed')),
  segment_count integer not null check (segment_count > 0),
  provider_message_id text,
  provider_status integer,
  estimated_cost_cents numeric(10,4) not null default 0,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_usage_org_created_idx on public.sms_usage(organization_id, created_at desc);
create index if not exists sms_usage_org_status_idx on public.sms_usage(organization_id, status);
create index if not exists subscription_events_org_created_idx on public.subscription_events(organization_id, created_at desc);
create index if not exists sms_credit_packs_org_idx on public.sms_credit_packs(organization_id, created_at);

alter table public.subscription_events enable row level security;
alter table public.sms_credit_packs enable row level security;
alter table public.sms_usage enable row level security;

drop policy if exists "subscription_events_select_member" on public.subscription_events;
create policy "subscription_events_select_member" on public.subscription_events for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "sms_credit_packs_select_member" on public.sms_credit_packs;
create policy "sms_credit_packs_select_member" on public.sms_credit_packs for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "sms_usage_select_member" on public.sms_usage;
create policy "sms_usage_select_member" on public.sms_usage for select to authenticated
using (public.is_organization_member(organization_id));

create or replace function public.get_subscription_overview()
returns table (
  organization_id uuid,
  subscription_id uuid,
  plan_id text,
  plan_name text,
  monthly_price_cents integer,
  included_sms integer,
  status text,
  billing_interval text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  used_segments bigint,
  reserved_segments bigint,
  pack_segments bigint,
  remaining_segments bigint,
  usage_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
    order by case ou.role when 'owner' then 0 when 'admin' then 1 else 2 end, ou.created_at
    limit 1
  ), usage_totals as (
    select
      s.organization_id,
      coalesce(sum(u.segment_count) filter (where u.status = 'sent'), 0)::bigint used_segments,
      coalesce(sum(u.segment_count) filter (where u.status = 'reserved' and u.created_at > now() - interval '15 minutes'), 0)::bigint reserved_segments
    from public.subscriptions s
    left join public.sms_usage u on u.organization_id = s.organization_id
      and u.created_at >= s.current_period_start and u.created_at < s.current_period_end
    group by s.organization_id
  ), packs as (
    select p.organization_id, coalesce(sum(p.remaining_segments) filter (where p.expires_at is null or p.expires_at > now()), 0)::bigint pack_segments
    from public.sms_credit_packs p group by p.organization_id
  )
  select s.organization_id, s.id, p.id, p.name, p.monthly_price_cents, p.included_sms,
    s.status, s.billing_interval, s.current_period_start, s.current_period_end, s.cancel_at_period_end,
    coalesce(ut.used_segments,0), coalesce(ut.reserved_segments,0), coalesce(pk.pack_segments,0),
    greatest(0, p.included_sms::bigint + coalesce(pk.pack_segments,0) - coalesce(ut.used_segments,0) - coalesce(ut.reserved_segments,0)),
    case when p.included_sms + coalesce(pk.pack_segments,0) = 0 then 100
      else round((coalesce(ut.used_segments,0)::numeric / (p.included_sms + coalesce(pk.pack_segments,0))::numeric) * 100, 1) end
  from membership m
  join public.subscriptions s on s.organization_id = m.organization_id
  join public.subscription_plans p on p.id = s.plan_id
  left join usage_totals ut on ut.organization_id = s.organization_id
  left join packs pk on pk.organization_id = s.organization_id;
$$;

create or replace function public.reserve_sms_send(
  p_replacement_id uuid,
  p_recipient_id uuid,
  p_message_type text,
  p_segments integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  sub_row public.subscriptions%rowtype;
  included integer;
  used bigint;
  pack_available bigint;
  usage_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  if p_segments is null or p_segments < 1 then raise exception 'Nombre de segments invalide.'; end if;
  if p_message_type not in ('initial','reminder','admin_notification','manual') then raise exception 'Type de SMS invalide.'; end if;

  select ou.organization_id into org_id from public.organization_users ou
  where ou.user_id = auth.uid() order by case ou.role when 'owner' then 0 when 'admin' then 1 else 2 end, ou.created_at limit 1;
  if org_id is null then raise exception 'Aucun établissement associé.' using errcode = '42501'; end if;
  if not exists (select 1 from public.replacement_requests r where r.id = p_replacement_id and r.organization_id = org_id) then
    raise exception 'Remplacement inaccessible.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.replacement_recipients rr where rr.id = p_recipient_id and rr.replacement_id = p_replacement_id and rr.organization_id = org_id) then
    raise exception 'Destinataire inaccessible.' using errcode = '42501';
  end if;

  select * into sub_row from public.subscriptions s where s.organization_id = org_id for update;
  if not found then raise exception 'Aucun abonnement actif.' using errcode = 'P0001'; end if;
  if sub_row.status not in ('active','past_due') then raise exception 'Envoi SMS bloqué : abonnement %.', sub_row.status using errcode = 'P0001'; end if;
  if sub_row.status = 'past_due' and sub_row.grace_period_end is not null and sub_row.grace_period_end < now() then
    raise exception 'Envoi SMS bloqué : délai de paiement expiré.' using errcode = 'P0001';
  end if;

  select sp.included_sms into included from public.subscription_plans sp where sp.id = sub_row.plan_id;
  select coalesce(sum(su.segment_count),0) into used from public.sms_usage su
    where su.organization_id = org_id and (su.status = 'sent' or (su.status = 'reserved' and su.created_at > now() - interval '15 minutes'))
      and su.created_at >= sub_row.current_period_start and su.created_at < sub_row.current_period_end;
  select coalesce(sum(p.remaining_segments),0) into pack_available from public.sms_credit_packs p
    where p.organization_id = org_id and (p.expires_at is null or p.expires_at > now());

  if used + p_segments > included + pack_available then
    raise exception 'Quota SMS insuffisant. Il reste % segment(s).', greatest(0, included + pack_available - used) using errcode = 'P0001';
  end if;

  insert into public.sms_usage (organization_id,replacement_id,recipient_id,message_type,status,segment_count,estimated_cost_cents)
  values (org_id,p_replacement_id,p_recipient_id,p_message_type,'reserved',p_segments,p_segments * 4.5)
  returning id into usage_id;
  return usage_id;
end;
$$;

create or replace function public.finalize_sms_send(
  p_usage_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_provider_status integer default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  update public.sms_usage set
    status = case when p_success then 'sent' else 'failed' end,
    provider_message_id = p_provider_message_id,
    provider_status = p_provider_status,
    error_message = p_error_message,
    sent_at = case when p_success then now() else null end,
    updated_at = now()
  where id = p_usage_id and public.is_organization_member(organization_id) and status = 'reserved';
end;
$$;

grant select on public.sms_usage, public.sms_credit_packs, public.subscription_events to authenticated;
grant execute on function public.get_subscription_overview() to authenticated;
grant execute on function public.reserve_sms_send(uuid,uuid,text,integer) to authenticated;
grant execute on function public.finalize_sms_send(uuid,boolean,text,integer,text) to authenticated;

insert into public.subscription_events (organization_id, subscription_id, event_type, description)
select s.organization_id, s.id, 'created', 'Abonnement initialisé'
from public.subscriptions s
where not exists (select 1 from public.subscription_events e where e.subscription_id = s.id and e.event_type = 'created');

commit;
