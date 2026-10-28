-- Monitora+ multi-tenant (3/3): RPCs por organização.

drop function if exists public.publish_session(uuid, timestamptz, timestamptz, text, text, integer);
drop function if exists public.cancel_session(uuid);
drop function if exists public.book_session(uuid, timestamptz);
drop function if exists public.cancel_booking(uuid);
drop function if exists public.start_session(uuid);
drop function if exists public.check_in(uuid, text);
drop function if exists public.end_session(uuid);
drop function if exists public.submit_review(uuid, integer, text[], text);
drop function if exists public.redeem_reward(uuid);
drop function if exists public.grant_semester_credits(numeric);
drop function if exists public.get_leaderboard(text, text, uuid);
drop function if exists public.session_taken(uuid[]);
drop function if exists private.award_badges(uuid);

-- ---------------------------------------------------------------- cadastro: só identidade global
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------- catálogo inicial de uma organização nova
create function private.seed_org_catalog(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.departments (org_id, name) values
    (p_org, 'Exatas'), (p_org, 'Computação'), (p_org, 'Engenharias');

  insert into public.courses (org_id, department_id, name)
  select p_org, d.id, c.name
  from (values
    ('Exatas', 'Matemática'), ('Exatas', 'Física'),
    ('Computação', 'Ciência da Computação'), ('Computação', 'Sistemas de Informação'),
    ('Engenharias', 'Engenharia Civil'), ('Engenharias', 'Engenharia Elétrica')
  ) as c (dept, name)
  join public.departments d on d.org_id = p_org and d.name = c.dept;

  insert into public.subjects (org_id, department_id, code, name, difficulty)
  select p_org, d.id, s.code, s.name, s.difficulty
  from (values
    ('Exatas', 'MAT101', 'Cálculo I', 3), ('Exatas', 'MAT102', 'Cálculo II', 3),
    ('Exatas', 'MAT110', 'Álgebra Linear', 2), ('Exatas', 'FIS101', 'Física I', 3),
    ('Exatas', 'EST101', 'Probabilidade e Estatística', 2),
    ('Computação', 'COM101', 'Programação I', 2), ('Computação', 'COM102', 'Estruturas de Dados', 3),
    ('Computação', 'COM110', 'Banco de Dados', 2), ('Computação', 'COM120', 'Lógica para Computação', 1),
    ('Engenharias', 'ENG101', 'Desenho Técnico', 1), ('Engenharias', 'ENG110', 'Circuitos Elétricos', 3)
  ) as s (dept, code, name, difficulty)
  join public.departments d on d.org_id = p_org and d.name = s.dept;

  insert into public.rewards (org_id, title, description, kind, cost) values
    (p_org, '10h de atividades complementares', 'Converte 10 créditos em 10 horas de atividades complementares, com comprovante auditável.', 'horas_complementares', 10),
    (p_org, '5h de atividades complementares', 'Converte 5 créditos em 5 horas de atividades complementares.', 'horas_complementares', 5),
    (p_org, 'Monitoria de disciplina avançada', 'Acesso prioritário a monitorias de disciplinas mais complexas.', 'acesso', 3),
    (p_org, 'Prioridade na matrícula', 'Prioridade na escolha de disciplinas no próximo período.', 'vantagem', 8),
    (p_org, 'Desconto de 20% na xerox', 'Cupom de desconto no centro de cópias.', 'vantagem', 2),
    (p_org, 'Cupom de livraria parceira', 'Cupom de R$ 30 em livrarias parceiras.', 'vantagem', 6);
end;
$$;

-- ---------------------------------------------------------------- compromissos de quem sai da organização
create function private.cancel_session_core(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_booking record;
begin
  select * into v_session from public.sessions where id = p_session for update;
  for v_booking in
    select id, student_id from public.session_bookings
    where session_id = p_session and status = 'booked'
  loop
    insert into public.credit_transactions (org_id, user_id, amount, kind, booking_id, note)
    values (v_session.org_id, v_booking.student_id,
            round(extract(epoch from v_session.ends_at - v_session.starts_at) / 3600.0, 2),
            'hold_release', v_booking.id, 'Monitoria cancelada');
    update public.session_bookings set status = 'cancelled' where id = v_booking.id;
  end loop;
  update public.sessions set status = 'cancelled' where id = p_session;
end;
$$;

create function private.release_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if exists (
    select 1 from public.sessions s
    where s.org_id = p_org and s.status = 'in_progress'
      and (s.monitor_id = p_user or exists (
        select 1 from public.session_bookings b
        where b.session_id = s.id and b.student_id = p_user and b.status in ('booked', 'checked_in')
      ))
  ) then
    raise exception 'Há uma monitoria em andamento. Conclua-a antes de sair.';
  end if;

  for r in
    select b.id, s.starts_at, s.ends_at
    from public.session_bookings b
    join public.sessions s on s.id = b.session_id
    where b.org_id = p_org and b.student_id = p_user and b.status = 'booked' and s.status = 'open'
  loop
    insert into public.credit_transactions (org_id, user_id, amount, kind, booking_id, note)
    values (p_org, p_user, round(extract(epoch from r.ends_at - r.starts_at) / 3600.0, 2),
            'hold_release', r.id, 'Saída da organização');
    update public.session_bookings set status = 'cancelled' where id = r.id;
  end loop;

  for r in
    select id from public.sessions where org_id = p_org and monitor_id = p_user and status = 'open'
  loop
    perform private.cancel_session_core(r.id);
  end loop;

  update public.memberships set status = 'left' where org_id = p_org and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------- medalhas
create function private.award_badges(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_semester_start timestamptz;
  v_ok boolean;
begin
  if exists (
    select 1
    from public.sessions s
    join public.session_bookings b on b.session_id = s.id
    where s.org_id = p_org and s.monitor_id = p_user and s.status = 'completed'
      and b.status in ('checked_in', 'reviewed')
      and b.exam_at >= s.ends_at and b.exam_at - s.ends_at <= interval '48 hours'
  ) then
    insert into public.user_badges (org_id, user_id, badge_code) values (p_org, p_user, 'salvador_de_vidas')
    on conflict do nothing;
  end if;

  v_semester_start := make_timestamptz(
    extract(year from now() at time zone 'America/Sao_Paulo')::int,
    case when extract(month from now() at time zone 'America/Sao_Paulo') > 6 then 7 else 1 end,
    1, 0, 0, 0, 'America/Sao_Paulo'
  );
  if (
    select count(distinct s.subject_id) from public.sessions s
    where s.org_id = p_org and s.monitor_id = p_user and s.status = 'completed' and s.starts_at >= v_semester_start
  ) >= 3 then
    insert into public.user_badges (org_id, user_id, badge_code) values (p_org, p_user, 'multidisciplinar')
    on conflict do nothing;
  end if;

  if (
    select count(*) from public.sessions s
    where s.org_id = p_org and s.monitor_id = p_user and s.status = 'completed'
      and (s.starts_at at time zone 'America/Sao_Paulo')::time < time '08:00'
  ) >= 3 then
    insert into public.user_badges (org_id, user_id, badge_code) values (p_org, p_user, 'madrugador')
    on conflict do nothing;
  end if;

  select count(*) = 5
         and bool_and(
           abs(extract(epoch from t.monitor_started_at - t.starts_at)) <= 300
           and abs(extract(epoch from t.monitor_ended_at - t.ends_at)) <= 300
         )
  into v_ok
  from (
    select s.starts_at, s.ends_at, s.monitor_started_at, s.monitor_ended_at
    from public.sessions s
    where s.org_id = p_org and s.monitor_id = p_user and s.status = 'completed'
    order by s.starts_at desc
    limit 5
  ) t;
  if coalesce(v_ok, false) then
    insert into public.user_badges (org_id, user_id, badge_code) values (p_org, p_user, 'pontualidade_britanica')
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------- organizações
create function public.create_organization(p_name text, p_slug text, p_description text default null)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slug text := lower(trim(p_slug));
  v_org public.organizations;
begin
  if v_uid is null then raise exception 'Faça login para continuar.'; end if;
  if char_length(trim(p_name)) < 2 then raise exception 'Informe o nome da organização.'; end if;
  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    raise exception 'O endereço deve ter de 3 a 40 caracteres: letras minúsculas, números e hífen.';
  end if;
  if (select count(*) from public.organizations where created_by = v_uid) >= 5 then
    raise exception 'Você já criou o máximo de 5 organizações.';
  end if;

  begin
    insert into public.organizations (slug, name, description, created_by)
    values (v_slug, trim(p_name), nullif(trim(p_description), ''), v_uid)
    returning * into v_org;
  exception when unique_violation then
    raise exception 'Esse endereço já está em uso. Escolha outro.';
  end;

  insert into public.memberships (org_id, user_id, role) values (v_org.id, v_uid, 'owner');
  if v_org.welcome_credits > 0 then
    insert into public.credit_transactions (org_id, user_id, amount, kind, note)
    values (v_org.id, v_uid, v_org.welcome_credits, 'initial_grant', 'Saldo de boas-vindas');
  end if;
  perform private.seed_org_catalog(v_org.id);
  return v_org;
end;
$$;

create function public.preview_invite(p_code text)
returns table (org_id uuid, name text, slug text, description text, already_member boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Faça login para continuar.'; end if;
  return query
    select o.id, o.name, o.slug, o.description,
           exists (select 1 from public.memberships m
                   where m.org_id = o.id and m.user_id = (select auth.uid()) and m.status = 'active')
    from public.organizations o
    where o.invite_code = upper(trim(p_code));
end;
$$;

create function public.join_organization(p_code text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org public.organizations;
  v_member public.memberships;
begin
  if v_uid is null then raise exception 'Faça login para continuar.'; end if;
  select * into v_org from public.organizations where invite_code = upper(trim(p_code));
  if not found then raise exception 'Código de convite inválido ou expirado.'; end if;

  select * into v_member from public.memberships where org_id = v_org.id and user_id = v_uid for update;
  if found then
    if v_member.status = 'left' then
      update public.memberships set status = 'active' where org_id = v_org.id and user_id = v_uid;
    end if;
    return v_org;
  end if;

  insert into public.memberships (org_id, user_id) values (v_org.id, v_uid);
  if v_org.welcome_credits > 0 then
    insert into public.credit_transactions (org_id, user_id, amount, kind, note)
    values (v_org.id, v_uid, v_org.welcome_credits, 'initial_grant', 'Saldo de boas-vindas');
  end if;
  return v_org;
end;
$$;

create function public.leave_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
begin
  select role into v_role from public.memberships
  where org_id = p_org and user_id = v_uid and status = 'active';
  if v_role is null then raise exception 'Você não faz parte desta organização.'; end if;
  if v_role = 'owner' and not exists (
    select 1 from public.memberships
    where org_id = p_org and role = 'owner' and status = 'active' and user_id <> v_uid
  ) then
    raise exception 'Você é o único proprietário. Transfira a propriedade antes de sair.';
  end if;
  perform private.release_member(p_org, v_uid);
end;
$$;

create function public.rotate_invite_code(p_org uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  perform private.require_admin(p_org);
  update public.organizations set invite_code = v_code where id = p_org;
  return v_code;
end;
$$;

create function public.update_organization(
  p_org uuid, p_name text, p_description text, p_welcome_credits numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin(p_org);
  if char_length(trim(p_name)) < 2 then raise exception 'Informe o nome da organização.'; end if;
  if p_welcome_credits < 0 or p_welcome_credits > 100 then raise exception 'Créditos de boas-vindas inválidos.'; end if;
  update public.organizations
  set name = trim(p_name), description = nullif(trim(p_description), ''), welcome_credits = p_welcome_credits
  where id = p_org;
end;
$$;

create function public.set_member_role(p_org uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current text;
begin
  if p_role not in ('owner', 'admin', 'member') then raise exception 'Papel inválido.'; end if;
  if not exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = v_uid and status = 'active' and role = 'owner'
  ) then
    raise exception 'Apenas proprietários podem alterar papéis.';
  end if;

  select role into v_current from public.memberships
  where org_id = p_org and user_id = p_user and status = 'active';
  if v_current is null then raise exception 'Membro não encontrado.'; end if;

  if v_current = 'owner' and p_role <> 'owner' and not exists (
    select 1 from public.memberships
    where org_id = p_org and role = 'owner' and status = 'active' and user_id <> p_user
  ) then
    raise exception 'A organização precisa de ao menos um proprietário.';
  end if;

  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
end;
$$;

create function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_target text;
  v_caller text;
begin
  perform private.require_admin(p_org);
  select role into v_caller from public.memberships where org_id = p_org and user_id = v_uid;
  select role into v_target from public.memberships
  where org_id = p_org and user_id = p_user and status = 'active';
  if v_target is null then raise exception 'Membro não encontrado.'; end if;
  if p_user = v_uid then raise exception 'Use "Sair da organização" para remover a si mesmo.'; end if;
  if v_target = 'owner' or (v_target = 'admin' and v_caller <> 'owner') then
    raise exception 'Você não tem permissão para remover este membro.';
  end if;
  perform private.release_member(p_org, p_user);
end;
$$;

create function public.grant_semester_credits(p_org uuid, p_amount numeric)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.require_admin(p_org);
  if p_amount <= 0 or p_amount > 100 then raise exception 'Valor inválido.'; end if;
  insert into public.credit_transactions (org_id, user_id, amount, kind, note)
  select p_org, user_id, p_amount, 'initial_grant', 'Saldo inicial do semestre'
  from public.memberships where org_id = p_org and status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- oferta
create function public.publish_session(
  p_org uuid,
  p_subject uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mode text,
  p_location text,
  p_capacity integer default 1
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
begin
  perform private.require_member(p_org);
  if not exists (
    select 1 from public.monitor_subjects
    where org_id = p_org and monitor_id = v_uid and subject_id = p_subject
  ) then
    raise exception 'Adicione a matéria ao seu perfil de monitor antes de publicar horários.';
  end if;
  if p_starts_at <= now() then raise exception 'O horário precisa estar no futuro.'; end if;

  select xp into v_xp from public.memberships where org_id = p_org and user_id = v_uid;
  if p_capacity > 1 and public.level_for_xp(v_xp) < 5 then
    raise exception 'Grupos maiores exigem nível 5 (Tutor Experiente).';
  end if;

  begin
    insert into public.sessions (org_id, monitor_id, subject_id, starts_at, ends_at, mode, location, capacity)
    values (p_org, v_uid, p_subject, p_starts_at, p_ends_at, p_mode, p_location, p_capacity)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Você já tem uma monitoria nesse intervalo.';
  end;
  return v_id;
end;
$$;

create function public.cancel_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session for update;
  if not found or v_session.monitor_id is distinct from v_uid then
    raise exception 'Monitoria não encontrada.';
  end if;
  perform private.require_member(v_session.org_id);
  if v_session.status <> 'open' then raise exception 'Só é possível cancelar monitorias abertas.'; end if;
  perform private.cancel_session_core(p_session);
end;
$$;

-- ---------------------------------------------------------------- agendamento
create function public.book_session(p_session uuid, p_exam_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_hours numeric(6, 2);
  v_balance numeric;
  v_booking uuid;
begin
  if v_uid is null then raise exception 'Faça login para continuar.'; end if;

  select * into v_session from public.sessions where id = p_session for update;
  if not found then raise exception 'Monitoria indisponível.'; end if;
  perform private.require_member(v_session.org_id);
  if v_session.status <> 'open' then raise exception 'Monitoria indisponível.'; end if;
  if v_session.starts_at <= now() then raise exception 'Essa monitoria já começou.'; end if;
  if v_session.monitor_id = v_uid then raise exception 'Você não pode agendar a própria monitoria.'; end if;

  -- serializa operações de carteira do mesmo usuário nesta organização
  perform 1 from public.memberships where org_id = v_session.org_id and user_id = v_uid for update;

  if exists (
    select 1 from public.session_bookings
    where session_id = p_session and student_id = v_uid and status <> 'cancelled'
  ) then
    raise exception 'Você já está inscrito nessa monitoria.';
  end if;

  if (
    select count(*) from public.session_bookings
    where session_id = p_session and status in ('booked', 'checked_in', 'reviewed')
  ) >= v_session.capacity then
    raise exception 'Monitoria lotada.';
  end if;

  v_hours := round(extract(epoch from v_session.ends_at - v_session.starts_at) / 3600.0, 2);
  select coalesce(sum(amount), 0) into v_balance
  from public.credit_transactions where org_id = v_session.org_id and user_id = v_uid;
  if v_balance < v_hours then
    raise exception 'Saldo insuficiente: você precisa de % crédito(s). Que tal monitorar para ganhar horas?', v_hours;
  end if;

  insert into public.session_bookings (org_id, session_id, student_id, exam_at)
  values (v_session.org_id, p_session, v_uid, p_exam_at)
  on conflict (session_id, student_id)
    do update set status = 'booked', exam_at = excluded.exam_at, checked_in_at = null
  returning id into v_booking;

  insert into public.credit_transactions (org_id, user_id, amount, kind, booking_id, note)
  values (v_session.org_id, v_uid, -v_hours, 'hold', v_booking, 'Reserva de monitoria');

  return v_booking;
end;
$$;

create function public.cancel_booking(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.session_bookings;
  v_session public.sessions;
  v_hours numeric(6, 2);
begin
  select * into v_booking from public.session_bookings
  where id = p_booking and student_id = v_uid for update;
  if not found or v_booking.status <> 'booked' then raise exception 'Reserva não encontrada.'; end if;
  perform private.require_member(v_booking.org_id);

  select * into v_session from public.sessions where id = v_booking.session_id;
  if v_session.status <> 'open' then raise exception 'A monitoria já começou.'; end if;

  if v_session.starts_at - now() > interval '2 hours' then
    v_hours := round(extract(epoch from v_session.ends_at - v_session.starts_at) / 3600.0, 2);
    insert into public.credit_transactions (org_id, user_id, amount, kind, booking_id, note)
    values (v_booking.org_id, v_uid, v_hours, 'hold_release', p_booking, 'Cancelamento com antecedência');
  end if;

  update public.session_bookings set status = 'cancelled' where id = p_booking;
end;
$$;

-- ---------------------------------------------------------------- execução
create function public.start_session(p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_code text;
begin
  select * into v_session from public.sessions where id = p_session for update;
  if not found or v_session.monitor_id is distinct from v_uid then
    raise exception 'Monitoria não encontrada.';
  end if;
  perform private.require_member(v_session.org_id);
  if v_session.status <> 'open' then raise exception 'Essa monitoria não pode ser iniciada.'; end if;
  if now() < v_session.starts_at - interval '15 minutes' or now() > v_session.ends_at then
    raise exception 'Só é possível iniciar a partir de 15 minutos antes do horário.';
  end if;
  if not exists (
    select 1 from public.session_bookings where session_id = p_session and status = 'booked'
  ) then
    raise exception 'Nenhum aluno inscrito nessa monitoria.';
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into public.session_codes (session_id, code) values (p_session, v_code)
  on conflict (session_id) do update set code = excluded.code;

  update public.sessions set status = 'in_progress', monitor_started_at = now() where id = p_session;
  return v_code;
end;
$$;

create function public.check_in(p_session uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking uuid;
  v_org uuid;
begin
  select b.id, b.org_id into v_booking, v_org
  from public.session_bookings b
  join public.sessions s on s.id = b.session_id
  where b.session_id = p_session and b.student_id = v_uid
    and b.status = 'booked' and s.status = 'in_progress'
  for update of b;
  if v_booking is null then raise exception 'Check-in indisponível para essa monitoria.'; end if;
  perform private.require_member(v_org);

  if not exists (
    select 1 from public.session_codes where session_id = p_session and code = p_code
  ) then
    raise exception 'Código inválido.';
  end if;

  update public.session_bookings set status = 'checked_in', checked_in_at = now() where id = v_booking;
end;
$$;

create function public.end_session(p_session uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_hours numeric(6, 2);
  v_present integer;
  v_booking record;
begin
  select * into v_session from public.sessions where id = p_session for update;
  if not found or v_session.monitor_id is distinct from v_uid then
    raise exception 'Monitoria não encontrada.';
  end if;
  perform private.require_member(v_session.org_id);
  if v_session.status <> 'in_progress' then raise exception 'A monitoria não está em andamento.'; end if;

  v_hours := round(extract(epoch from v_session.ends_at - v_session.starts_at) / 3600.0, 2);

  for v_booking in
    select id, student_id from public.session_bookings
    where session_id = p_session and status = 'booked'
  loop
    insert into public.credit_transactions (org_id, user_id, amount, kind, booking_id, note)
    values (v_session.org_id, v_booking.student_id, v_hours, 'hold_release', v_booking.id, 'Ausência registrada');
    update public.session_bookings set status = 'no_show' where id = v_booking.id;
  end loop;

  update public.sessions set status = 'completed', monitor_ended_at = now() where id = p_session;

  select count(*) into v_present from public.session_bookings
  where session_id = p_session and status = 'checked_in';
  if v_present = 0 then return 0; end if;

  insert into public.credit_transactions (org_id, user_id, amount, kind, note)
  values (v_session.org_id, v_uid, v_hours, 'earning', 'Monitoria concluída');
  update public.memberships
  set xp = xp + round(v_hours * 100)::int, hours_given = hours_given + v_hours
  where org_id = v_session.org_id and user_id = v_uid;

  perform private.award_badges(v_session.org_id, v_uid);
  return v_hours;
end;
$$;

-- ---------------------------------------------------------------- avaliação
create function public.submit_review(
  p_booking uuid, p_rating integer, p_tags text[] default '{}', p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.session_bookings;
  v_monitor uuid;
begin
  select * into v_booking from public.session_bookings
  where id = p_booking and student_id = v_uid for update;
  if not found or v_booking.status <> 'checked_in' then
    raise exception 'Você só pode avaliar monitorias em que fez check-in.';
  end if;
  perform private.require_member(v_booking.org_id);

  select s.monitor_id into v_monitor from public.sessions s
  where s.id = v_booking.session_id and s.status = 'completed';
  if v_monitor is null then raise exception 'A monitoria ainda não foi encerrada.'; end if;

  insert into public.reviews (org_id, booking_id, monitor_id, student_id, rating, tags, comment)
  values (v_booking.org_id, p_booking, v_monitor, v_uid, p_rating, coalesce(p_tags, '{}'), nullif(trim(p_comment), ''));

  update public.session_bookings set status = 'reviewed' where id = p_booking;

  update public.memberships
  set rating_sum = rating_sum + p_rating,
      rating_count = rating_count + 1,
      xp = xp + case p_rating when 5 then 20 when 4 then 10 else 0 end
  where org_id = v_booking.org_id and user_id = v_monitor;
end;
$$;

-- ---------------------------------------------------------------- resgates
create function public.redeem_reward(p_reward uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reward public.rewards;
  v_balance numeric;
  v_redemption uuid;
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if v_uid is null then raise exception 'Faça login para continuar.'; end if;
  select * into v_reward from public.rewards where id = p_reward and active;
  if not found then raise exception 'Recompensa indisponível.'; end if;
  perform private.require_member(v_reward.org_id);

  perform 1 from public.memberships where org_id = v_reward.org_id and user_id = v_uid for update;
  select coalesce(sum(amount), 0) into v_balance
  from public.credit_transactions where org_id = v_reward.org_id and user_id = v_uid;
  if v_balance < v_reward.cost then raise exception 'Saldo insuficiente para este resgate.'; end if;

  insert into public.redemptions (org_id, user_id, reward_id, cost, verification_code)
  values (v_reward.org_id, v_uid, p_reward, v_reward.cost, v_code)
  returning id into v_redemption;

  insert into public.credit_transactions (org_id, user_id, amount, kind, redemption_id, note)
  values (v_reward.org_id, v_uid, -v_reward.cost, 'redemption', v_redemption, v_reward.title);

  return v_code;
end;
$$;

-- ---------------------------------------------------------------- consultas
create function public.session_taken(p_ids uuid[])
returns table (session_id uuid, taken integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.session_id, count(*)::int
  from public.session_bookings b
  join public.sessions s on s.id = b.session_id
  where b.session_id = any (p_ids)
    and b.status in ('booked', 'checked_in', 'reviewed')
    and (select private.is_member(s.org_id))
  group by b.session_id;
$$;

create function public.get_leaderboard(
  p_org uuid,
  p_metric text default 'hours_month',
  p_scope text default 'campus',
  p_scope_id uuid default null
)
returns table (
  user_id uuid, full_name text, course_name text, level integer,
  hours numeric, avg_rating numeric, review_count integer
)
language sql
stable
set search_path = ''
as $$
  with month_hours as (
    select s.monitor_id, sum(extract(epoch from s.ends_at - s.starts_at) / 3600.0) as h
    from public.sessions s
    where s.org_id = p_org and s.status = 'completed'
      and s.monitor_ended_at >=
        date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    group by s.monitor_id
  )
  select m.user_id, p.full_name, c.name, public.level_for_xp(m.xp),
         round(coalesce(h.h, 0)::numeric, 1),
         case when m.rating_count > 0 then round(m.rating_sum::numeric / m.rating_count, 2) end,
         m.rating_count
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  left join public.courses c on c.org_id = m.org_id and c.id = m.course_id
  left join month_hours h on h.monitor_id = m.user_id
  where m.org_id = p_org and m.status = 'active'
    and (
      p_scope = 'campus'
      or (p_scope = 'course' and m.course_id = p_scope_id)
      or (p_scope = 'department' and c.department_id = p_scope_id)
    )
    and case when p_metric = 'rating' then m.rating_count > 0 else coalesce(h.h, 0) > 0 end
  order by
    case when p_metric = 'rating' then m.rating_sum::numeric / nullif(m.rating_count, 0) else h.h end
      desc nulls last,
    m.rating_count desc
  limit 50;
$$;

-- ---------------------------------------------------------------- permissões
revoke all on function
  public.create_organization(text, text, text), public.preview_invite(text), public.join_organization(text),
  public.leave_organization(uuid), public.rotate_invite_code(uuid),
  public.update_organization(uuid, text, text, numeric), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.grant_semester_credits(uuid, numeric),
  public.publish_session(uuid, uuid, timestamptz, timestamptz, text, text, integer),
  public.cancel_session(uuid), public.book_session(uuid, timestamptz), public.cancel_booking(uuid),
  public.start_session(uuid), public.check_in(uuid, text), public.end_session(uuid),
  public.submit_review(uuid, integer, text[], text), public.redeem_reward(uuid),
  public.session_taken(uuid[]), public.get_leaderboard(uuid, text, text, uuid)
  from public, anon;

grant execute on function
  public.create_organization(text, text, text), public.preview_invite(text), public.join_organization(text),
  public.leave_organization(uuid), public.rotate_invite_code(uuid),
  public.update_organization(uuid, text, text, numeric), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.grant_semester_credits(uuid, numeric),
  public.publish_session(uuid, uuid, timestamptz, timestamptz, text, text, integer),
  public.cancel_session(uuid), public.book_session(uuid, timestamptz), public.cancel_booking(uuid),
  public.start_session(uuid), public.check_in(uuid, text), public.end_session(uuid),
  public.submit_review(uuid, integer, text[], text), public.redeem_reward(uuid),
  public.session_taken(uuid[]), public.get_leaderboard(uuid, text, text, uuid)
  to authenticated;

revoke all on function
  private.seed_org_catalog(uuid), private.cancel_session_core(uuid), private.release_member(uuid, uuid),
  private.award_badges(uuid, uuid)
  from public, anon, authenticated;
