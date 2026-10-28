-- Videochamada integrada (LiveKit): sessões com sala própria e presença registrada via webhook.

alter table public.sessions add column in_app_call boolean not null default false;

-- ---------------------------------------------------------------- presença na chamada
create table public.session_presence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  join_event_id text unique,
  leave_event_id text unique,
  constraint session_presence_session_fk
    foreign key (org_id, session_id) references public.sessions (org_id, id) on delete cascade,
  constraint session_presence_user_fk
    foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade
);
create index session_presence_org_session_idx on public.session_presence (org_id, session_id);
create index session_presence_org_user_idx on public.session_presence (org_id, user_id);

alter table public.session_presence enable row level security;

-- quem entrou vê o próprio registro; o monitor da sessão vê o de todos
create policy session_presence_read on public.session_presence for select to authenticated
  using (
    (select private.is_member(org_id))
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.sessions s
        where s.id = session_id and s.monitor_id = (select auth.uid())
      )
    )
  );

revoke all on public.session_presence from anon;
revoke insert, update, delete on public.session_presence from authenticated;

-- ---------------------------------------------------------------- registro de presença (só service_role)
create function public.record_presence(
  p_session uuid,
  p_user uuid,
  p_event text,
  p_at timestamptz,
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_open uuid;
begin
  select * into v_session from public.sessions where id = p_session;
  if not found or not v_session.in_app_call then
    return;
  end if;
  if not exists (
    select 1 from public.memberships
    where org_id = v_session.org_id and user_id = p_user and status = 'active'
  ) then
    return;
  end if;

  if p_event = 'participant_joined' then
    insert into public.session_presence (org_id, session_id, user_id, joined_at, join_event_id)
    values (v_session.org_id, p_session, p_user, p_at, p_event_id)
    on conflict (join_event_id) do nothing;

    -- check-in automático do aluno com reserva, quando a sessão já foi iniciada
    if p_user <> v_session.monitor_id and v_session.status = 'in_progress' then
      update public.session_bookings
      set status = 'checked_in', checked_in_at = p_at
      where session_id = p_session and student_id = p_user and status = 'booked';
    end if;

  elsif p_event = 'participant_left' then
    if exists (select 1 from public.session_presence where leave_event_id = p_event_id) then
      return;
    end if;
    select id into v_open
    from public.session_presence
    where session_id = p_session and user_id = p_user and left_at is null
    order by joined_at desc
    limit 1;
    if v_open is not null then
      update public.session_presence set left_at = p_at, leave_event_id = p_event_id where id = v_open;
    end if;
  end if;
end;
$$;

revoke all on function public.record_presence(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_presence(uuid, uuid, text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------- uso mensal (admin)
create function public.org_call_usage(p_org uuid)
returns table (minutes integer, calls integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin(p_org);
  return query
    select coalesce(round(sum(extract(epoch from (p.left_at - p.joined_at))) / 60), 0)::int,
           count(distinct p.session_id)::int
    from public.session_presence p
    where p.org_id = p_org
      and p.left_at is not null
      and p.joined_at >=
        date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
end;
$$;

revoke all on function public.org_call_usage(uuid) from public, anon;
grant execute on function public.org_call_usage(uuid) to authenticated;

-- ---------------------------------------------------------------- oferta com chamada integrada
drop function public.publish_session(uuid, uuid, timestamptz, timestamptz, text, text, integer);

create function public.publish_session(
  p_org uuid,
  p_subject uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mode text,
  p_location text,
  p_capacity integer default 1,
  p_in_app boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_xp integer;
  v_id uuid;
  v_location text := p_location;
begin
  perform private.require_member(p_org);
  if not exists (
    select 1 from public.monitor_subjects
    where org_id = p_org and monitor_id = v_uid and subject_id = p_subject
  ) then
    raise exception 'Adicione a matéria ao seu perfil de monitor antes de publicar horários.';
  end if;
  if p_starts_at <= now() then raise exception 'O horário precisa estar no futuro.'; end if;

  if p_in_app then
    if p_mode <> 'online' then
      raise exception 'A videochamada integrada só está disponível para sessões online.';
    end if;
    v_location := 'Videochamada no Monitora+';
  end if;

  select xp into v_xp from public.memberships where org_id = p_org and user_id = v_uid;
  if p_capacity > 1 and public.level_for_xp(v_xp) < 5 then
    raise exception 'Grupos maiores exigem nível 5 (Tutor Experiente).';
  end if;

  begin
    insert into public.sessions (org_id, monitor_id, subject_id, starts_at, ends_at, mode, location, capacity, in_app_call)
    values (p_org, v_uid, p_subject, p_starts_at, p_ends_at, p_mode, v_location, p_capacity, p_in_app)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Você já tem uma monitoria nesse intervalo.';
  end;
  return v_id;
end;
$$;

revoke all on function public.publish_session(uuid, uuid, timestamptz, timestamptz, text, text, integer, boolean) from public, anon;
grant execute on function public.publish_session(uuid, uuid, timestamptz, timestamptz, text, text, integer, boolean) to authenticated;
