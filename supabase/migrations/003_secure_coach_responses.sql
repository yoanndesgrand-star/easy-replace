begin;

alter table public.replacement_requests
  add column if not exists accepted_recipient_id uuid,
  add column if not exists accepted_coach_id uuid references public.coaches(id) on delete set null,
  add column if not exists accepted_coach_name text,
  add column if not exists accepted_at timestamptz;

alter table public.replacement_recipients
  add column if not exists response_token uuid not null default gen_random_uuid(),
  add column if not exists response_status text not null default 'pending',
  add column if not exists responded_at timestamptz;

alter table public.replacement_recipients
  drop constraint if exists replacement_recipients_response_status_check;
alter table public.replacement_recipients
  add constraint replacement_recipients_response_status_check
  check (response_status in ('pending', 'accepted', 'declined', 'closed'));

create unique index if not exists replacement_recipients_response_token_idx
  on public.replacement_recipients(response_token);

alter table public.replacement_requests
  drop constraint if exists replacement_requests_accepted_recipient_id_fkey;
alter table public.replacement_requests
  add constraint replacement_requests_accepted_recipient_id_fkey
  foreign key (accepted_recipient_id)
  references public.replacement_recipients(id)
  on delete set null
  deferrable initially deferred;

create or replace function public.get_replacement_invitation(invitation_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'valid', true,
    'recipientId', rr.id,
    'coachName', rr.coach_name_snapshot,
    'responseStatus', rr.response_status,
    'respondedAt', rr.responded_at,
    'requestStatus', rq.status,
    'isFilled', rq.status = 'filled',
    'isCancelled', rq.status = 'cancelled',
    'acceptedCoachName', rq.accepted_coach_name,
    'acceptedAt', rq.accepted_at,
    'venue', rq.venue,
    'address', rq.address,
    'replacementDate', rq.replacement_date,
    'startTime', rq.start_time,
    'endTime', rq.end_time,
    'classType', rq.class_type,
    'requiredSpecialty', rq.required_specialty,
    'managerName', rq.manager_name,
    'managerPhone', rq.manager_phone,
    'expired', (rq.replacement_date + rq.end_time) < now()
  )
  into result
  from public.replacement_recipients rr
  join public.replacement_requests rq on rq.id = rr.replacement_id
  where rr.response_token = invitation_token;

  return coalesce(result, jsonb_build_object('valid', false));
end;
$$;

create or replace function public.respond_to_replacement_invitation(
  invitation_token uuid,
  decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_row public.replacement_recipients%rowtype;
  request_row public.replacement_requests%rowtype;
  won boolean := false;
begin
  if decision not in ('accepted', 'declined') then
    return jsonb_build_object('success', false, 'code', 'invalid_decision', 'message', 'Réponse invalide.');
  end if;

  select * into recipient_row
  from public.replacement_recipients
  where response_token = invitation_token
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'invalid_token', 'message', 'Ce lien est invalide.');
  end if;

  select * into request_row
  from public.replacement_requests
  where id = recipient_row.replacement_id
  for update;

  if request_row.status = 'cancelled' then
    return jsonb_build_object('success', false, 'code', 'cancelled', 'message', 'Cette demande a été annulée.');
  end if;

  if (request_row.replacement_date + request_row.end_time) < now() then
    return jsonb_build_object('success', false, 'code', 'expired', 'message', 'Cette demande est expirée.');
  end if;

  if request_row.status = 'filled' then
    return jsonb_build_object(
      'success', false,
      'code', 'already_filled',
      'message', 'Ce remplacement est déjà pourvu.',
      'acceptedCoachName', request_row.accepted_coach_name
    );
  end if;

  if recipient_row.response_status = 'declined' then
    return jsonb_build_object('success', true, 'code', 'already_declined', 'message', 'Votre indisponibilité a déjà été enregistrée.');
  end if;

  if recipient_row.response_status = 'accepted' then
    return jsonb_build_object('success', true, 'code', 'already_accepted', 'message', 'Ce remplacement vous est déjà attribué.');
  end if;

  if decision = 'declined' then
    update public.replacement_recipients
      set response_status = 'declined', responded_at = now()
      where id = recipient_row.id;
    return jsonb_build_object('success', true, 'code', 'declined', 'message', 'Votre réponse a bien été enregistrée.');
  end if;

  update public.replacement_requests
    set status = 'filled',
        accepted_recipient_id = recipient_row.id,
        accepted_coach_id = recipient_row.coach_id,
        accepted_coach_name = recipient_row.coach_name_snapshot,
        accepted_at = now()
    where id = request_row.id
      and status in ('draft', 'sent')
    returning true into won;

  if coalesce(won, false) is not true then
    select * into request_row from public.replacement_requests where id = recipient_row.replacement_id;
    return jsonb_build_object(
      'success', false,
      'code', 'already_filled',
      'message', 'Ce remplacement est déjà pourvu.',
      'acceptedCoachName', request_row.accepted_coach_name
    );
  end if;

  update public.replacement_recipients
    set response_status = case when id = recipient_row.id then 'accepted' else 'closed' end,
        responded_at = case when id = recipient_row.id then now() else responded_at end
    where replacement_id = request_row.id;

  return jsonb_build_object(
    'success', true,
    'code', 'accepted',
    'message', 'Le remplacement vous est attribué.',
    'coachName', recipient_row.coach_name_snapshot
  );
end;
$$;

revoke all on function public.get_replacement_invitation(uuid) from public;
revoke all on function public.respond_to_replacement_invitation(uuid, text) from public;
grant execute on function public.get_replacement_invitation(uuid) to anon, authenticated;
grant execute on function public.respond_to_replacement_invitation(uuid, text) to anon, authenticated;

-- Active le rafraîchissement immédiat du tableau de bord lorsque le projet le permet.
do $$
begin
  alter publication supabase_realtime add table public.replacement_requests;
exception
  when duplicate_object then null;
end $$;

commit;
