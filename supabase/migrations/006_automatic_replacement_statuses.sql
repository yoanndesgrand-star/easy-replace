begin;

-- Centralise les règles métier de statut dans PostgreSQL afin qu'elles ne
-- dépendent pas uniquement de l'interface React.
create or replace function public.replacement_end_at(
  replacement_day date,
  replacement_end time without time zone
)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select (replacement_day + replacement_end) at time zone 'Europe/Paris';
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
  end_at := public.replacement_end_at(new.replacement_date, new.end_time);

  -- Les états de clôture explicites sont prioritaires.
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

drop trigger if exists replacement_requests_normalize_status on public.replacement_requests;
create trigger replacement_requests_normalize_status
before insert or update on public.replacement_requests
for each row execute function public.normalize_replacement_request_status();

create or replace function public.close_replacement_invitations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'completed') then
    update public.replacement_recipients
      set response_status = 'closed'
      where replacement_id = new.id
        and response_status = 'pending';
  elsif new.status = 'filled' then
    update public.replacement_recipients
      set response_status = 'closed'
      where replacement_id = new.id
        and response_status = 'pending'
        and (new.accepted_recipient_id is null or id <> new.accepted_recipient_id);
  end if;

  return new;
end;
$$;

drop trigger if exists replacement_requests_close_invitations on public.replacement_requests;
create trigger replacement_requests_close_invitations
after insert or update of status, accepted_recipient_id, cancelled_at, completed_at
on public.replacement_requests
for each row execute function public.close_replacement_invitations();

-- Si un destinataire est marqué accepté par une autre voie que la RPC publique,
-- la demande parente est quand même normalisée en "filled".
create or replace function public.fill_request_from_accepted_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.response_status = 'accepted'
     and old.response_status is distinct from new.response_status then
    update public.replacement_requests
      set accepted_recipient_id = new.id,
          accepted_coach_id = new.coach_id,
          accepted_coach_name = new.coach_name_snapshot,
          accepted_at = coalesce(new.responded_at, now()),
          assignment_source = coalesce(assignment_source, 'coach_response')
      where id = new.replacement_id
        and status in ('draft', 'sent', 'filled')
        and cancelled_at is null
        and completed_at is null
        and archived_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists replacement_recipients_fill_parent on public.replacement_recipients;
create trigger replacement_recipients_fill_parent
after update of response_status on public.replacement_recipients
for each row execute function public.fill_request_from_accepted_recipient();

-- Fonction idempotente appelée au chargement de l'application et utilisable par
-- une tâche planifiée. Elle clôture les séances dont l'heure de fin est passée
-- et répare les statuts incohérents hérités d'anciennes versions.
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
    set status = 'completed',
        completed_at = coalesce(rq.completed_at, now())
    where rq.archived_at is null
      and rq.status not in ('cancelled', 'completed')
      and public.replacement_end_at(rq.replacement_date, rq.end_time) <= now();
  get diagnostics changed = row_count;
  affected := affected + changed;

  update public.replacement_requests rq
    set status = 'filled',
        accepted_at = coalesce(rq.accepted_at, now())
    where rq.archived_at is null
      and rq.status in ('draft', 'sent')
      and public.replacement_end_at(rq.replacement_date, rq.end_time) > now()
      and (
        rq.accepted_recipient_id is not null
        or rq.accepted_coach_id is not null
        or nullif(trim(coalesce(rq.accepted_coach_name, '')), '') is not null
        or exists (
          select 1
          from public.replacement_recipients rr
          where rr.replacement_id = rq.id
            and rr.response_status = 'accepted'
        )
      );
  get diagnostics changed = row_count;
  affected := affected + changed;

  update public.replacement_requests rq
    set status = 'cancelled',
        cancelled_at = coalesce(rq.cancelled_at, now())
    where rq.cancelled_at is not null
      and rq.status <> 'cancelled';
  get diagnostics changed = row_count;
  affected := affected + changed;

  return affected;
end;
$$;

grant execute on function public.synchronize_replacement_statuses() to authenticated;

-- Synchronisation immédiate des données existantes.
select public.synchronize_replacement_statuses();

commit;
