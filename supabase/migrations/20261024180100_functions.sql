-- Monitora+ : regras de negócio (RPCs, gatilhos, gamificação)

-- ---------------------------------------------------------------- níveis
-- 100 XP por hora monitorada; 200 XP por nível; teto no nível 10
create function public.level_for_xp(p_xp integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(10, 1 + greatest(p_xp, 0) / 200);
$$;

-- ---------------------------------------------------------------- cadastro
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
begin
  begin
    v_course := (new.raw_user_meta_data ->> 'course_id')::uuid;
  exception when others then
    v_course := null;
  end;
  select id into v_course from public.courses where id = v_course;

  insert into public.profiles (id, full_name, course_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    v_course
  );

  insert into public.credit_transactions (user_id, amount, kind, note)
  values (new.id, 5, 'initial_grant', 'Saldo inicial de boas-vindas');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- badges
create function private.award_badges(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_semester_start timestamptz;
  v_ok boolean;
begin
  -- Salvador de Vidas: ajudou um aluno nas 48h anteriores a uma prova
  if exists (
    select 1
    from public.sessions s
    join public.session_bookings b on b.session_id = s.id
    where s.monitor_id = p_user
      and s.status = 'completed'
      and b.status in ('checked_in', 'reviewed')
      and b.exam_at >= s.ends_at
      and b.exam_at - s.ends_at <= interval '48 hours'
  ) then
    insert into public.user_badges (user_id, badge_code) values (p_user, 'salvador_de_vidas')
    on conflict do nothing;
  end if;

  -- Multidisciplinar: 3 matérias diferentes no mesmo semestre
  v_semester_start := make_timestamptz(
    extract(year from now() at time zone 'America/Sao_Paulo')::int,
    case when extract(month from now() at time zone 'America/Sao_Paulo') > 6 then 7 else 1 end,
    1, 0, 0, 0, 'America/Sao_Paulo'
  );
  if (
    select count(distinct s.subject_id)
    from public.sessions s
    where s.monitor_id = p_user and s.status = 'completed' and s.starts_at >= v_semester_start
  ) >= 3 then
    insert into public.user_badges (user_id, badge_code) values (p_user, 'multidisciplinar')
    on conflict do nothing;
  end if;

  -- Madrugador: 3 monitorias iniciadas antes das 08h
  if (
    select count(*)
    from public.sessions s
    where s.monitor_id = p_user
      and s.status = 'completed'
      and (s.starts_at at time zone 'America/Sao_Paulo')::time < time '08:00'
  ) >= 3 then
    insert into public.user_badges (user_id, badge_code) values (p_user, 'madrugador')
    on conflict do nothing;
  end if;

  -- Pontualidade Britânica: últimas 5 iniciadas e encerradas no horário (±5 min)
  select count(*) = 5
         and bool_and(
           abs(extract(epoch from t.monitor_started_at - t.starts_at)) <= 300
           and abs(extract(epoch from t.monitor_ended_at - t.ends_at)) <= 300
         )
  into v_ok
  from (
    select s.starts_at, s.ends_at, s.monitor_started_at, s.monitor_ended_at
    from public.sessions s
    where s.monitor_id = p_user and s.status = 'completed'
    order by s.starts_at desc
    limit 5
  ) t;
  if coalesce(v_ok, false) then
    insert into public.user_badges (user_id, badge_code) values (p_user, 'pontualidade_britanica')
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------- oferta
create function public.publish_session(
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
  if v_uid is null then raise exception 'Faça login para continuar.'; end if;
  if not exists (
    select 1 from public.monitor_subjects where monitor_id = v_uid and subject_id = p_subject
  ) then
    raise exception 'Adicione a matéria ao seu perfil de monitor antes de publicar horários.';
  end if;
  if p_starts_at <= now() then raise exception 'O horário precisa estar no futuro.'; end if;

  select xp into v_xp from public.profiles where id = v_uid;
  if p_capacity > 1 and public.level_for_xp(v_xp) < 5 then
    raise exception 'Grupos maiores exigem nível 5 (Tutor Experiente).';
  end if;

  begin
    insert into public.sessions (monitor_id, subject_id, starts_at, ends_at, mode, location, capacity)
    values (v_uid, p_subject, p_starts_at, p_ends_at, p_mode, p_location, p_capacity)
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
  v_booking record;
begin
  select * into v_session from public.sessions where id = p_session for update;
  if not found or v_session.monitor_id is distinct from v_uid then
    raise exception 'Monitoria não encontrada.';
  end if;
  if v_session.status <> 'open' then raise exception 'Só é possível cancelar monitorias abertas.'; end if;

  for v_booking in
    select id, student_id from public.session_bookings
    where session_id = p_session and status = 'booked'
  loop
    insert into public.credit_transactions (user_id, amount, kind, booking_id, note)
    values (v_booking.student_id,
            round(extract(epoch from v_session.ends_at - v_session.starts_at) / 3600.0, 2),
            'hold_release', v_booking.id, 'Monitoria cancelada pelo monitor');
    update public.session_bookings set status = 'cancelled' where id = v_booking.id;
  end loop;

  update public.sessions set status = 'cancelled' where id = p_session;
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
  if not found or v_session.status <> 'open' then raise exception 'Monitoria indisponível.'; end if;
  if v_session.starts_at <= now() then raise exception 'Essa monitoria já começou.'; end if;
  if v_session.monitor_id = v_uid then raise exception 'Você não pode agendar a própria monitoria.'; end if;

  -- serializa operações de carteira do mesmo usuário
  perform 1 from public.profiles where id = v_uid for update;

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
  from public.credit_transactions where user_id = v_uid;
  if v_balance < v_hours then
    raise exception 'Saldo insuficiente: você precisa de % crédito(s). Que tal monitorar para ganhar horas?', v_hours;
  end if;

  insert into public.session_bookings (session_id, student_id, exam_at)
  values (p_session, v_uid, p_exam_at)
  on conflict (session_id, student_id)
    do update set status = 'booked', exam_at = excluded.exam_at, checked_in_at = null
  returning id into v_booking;

  insert into public.credit_transactions (user_id, amount, kind, booking_id, note)
  values (v_uid, -v_hours, 'hold', v_booking, 'Reserva de monitoria');

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

  select * into v_session from public.sessions where id = v_booking.session_id;
  if v_session.status <> 'open' then raise exception 'A monitoria já começou.'; end if;

  -- devolução integral só com mais de 2h de antecedência
  if v_session.starts_at - now() > interval '2 hours' then
    v_hours := round(extract(epoch from v_session.ends_at - v_session.starts_at) / 3600.0, 2);
    insert into public.credit_transactions (user_id, amount, kind, booking_id, note)
    values (v_uid, v_hours, 'hold_release', p_booking, 'Cancelamento com antecedência');
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
begin
  select b.id into v_booking
  from public.session_bookings b
  join public.sessions s on s.id = b.session_id
  where b.session_id = p_session and b.student_id = v_uid
    and b.status = 'booked' and s.status = 'in_progress'
  for update of b;
  if v_booking is null then raise exception 'Check-in indisponível para essa monitoria.'; end if;

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
  if v_session.status <> 'in_progress' then raise exception 'A monitoria não está em andamento.'; end if;

  v_hours := round(extract(epoch from v_session.ends_at - v_session.starts_at) / 3600.0, 2);

  -- quem não fez check-in tem a reserva devolvida
  for v_booking in
    select id, student_id from public.session_bookings
    where session_id = p_session and status = 'booked'
  loop
    insert into public.credit_transactions (user_id, amount, kind, booking_id, note)
    values (v_booking.student_id, v_hours, 'hold_release', v_booking.id, 'Ausência registrada');
    update public.session_bookings set status = 'no_show' where id = v_booking.id;
  end loop;

  update public.sessions set status = 'completed', monitor_ended_at = now() where id = p_session;

  select count(*) into v_present from public.session_bookings
  where session_id = p_session and status = 'checked_in';

  if v_present = 0 then return 0; end if;

  insert into public.credit_transactions (user_id, amount, kind, note)
  values (v_uid, v_hours, 'earning', 'Monitoria concluída');
  update public.profiles
  set xp = xp + round(v_hours * 100)::int, hours_given = hours_given + v_hours
  where id = v_uid;

  perform private.award_badges(v_uid);
  return v_hours;
end;
$$;

-- ---------------------------------------------------------------- avaliação
create function public.submit_review(
  p_booking uuid,
  p_rating integer,
  p_tags text[] default '{}',
  p_comment text default null
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

  select s.monitor_id into v_monitor from public.sessions s
  where s.id = v_booking.session_id and s.status = 'completed';
  if v_monitor is null then raise exception 'A monitoria ainda não foi encerrada.'; end if;

  insert into public.reviews (booking_id, monitor_id, student_id, rating, tags, comment)
  values (p_booking, v_monitor, v_uid, p_rating, coalesce(p_tags, '{}'), nullif(trim(p_comment), ''));

  update public.session_bookings set status = 'reviewed' where id = p_booking;

  -- bônus de XP para avaliações 4 e 5
  update public.profiles
  set rating_sum = rating_sum + p_rating,
      rating_count = rating_count + 1,
      xp = xp + case p_rating when 5 then 20 when 4 then 10 else 0 end
  where id = v_monitor;
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

  perform 1 from public.profiles where id = v_uid for update;
  select coalesce(sum(amount), 0) into v_balance from public.credit_transactions where user_id = v_uid;
  if v_balance < v_reward.cost then raise exception 'Saldo insuficiente para este resgate.'; end if;

  insert into public.redemptions (user_id, reward_id, cost, verification_code)
  values (v_uid, p_reward, v_reward.cost, v_code)
  returning id into v_redemption;

  insert into public.credit_transactions (user_id, amount, kind, redemption_id, note)
  values (v_uid, -v_reward.cost, 'redemption', v_redemption, v_reward.title);

  return v_code;
end;
$$;

-- saldo inicial do semestre (instituição)
create function public.grant_semester_credits(p_amount numeric)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  ) then
    raise exception 'Apenas a coordenação pode conceder saldo.';
  end if;
  if p_amount <= 0 then raise exception 'Valor inválido.'; end if;

  insert into public.credit_transactions (user_id, amount, kind, note)
  select id, p_amount, 'initial_grant', 'Saldo inicial do semestre' from public.profiles;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- ranking
create function public.get_leaderboard(
  p_metric text default 'hours_month',
  p_scope text default 'campus',
  p_scope_id uuid default null
)
returns table (
  user_id uuid,
  full_name text,
  course_name text,
  level integer,
  hours numeric,
  avg_rating numeric,
  review_count integer
)
language sql
stable
set search_path = ''
as $$
  with month_hours as (
    select s.monitor_id, sum(extract(epoch from s.ends_at - s.starts_at) / 3600.0) as h
    from public.sessions s
    where s.status = 'completed'
      and s.monitor_ended_at >=
        date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    group by s.monitor_id
  )
  select p.id, p.full_name, c.name, public.level_for_xp(p.xp),
         round(coalesce(m.h, 0)::numeric, 1),
         case when p.rating_count > 0 then round(p.rating_sum::numeric / p.rating_count, 2) end,
         p.rating_count
  from public.profiles p
  left join public.courses c on c.id = p.course_id
  left join month_hours m on m.monitor_id = p.id
  where (
      p_scope = 'campus'
      or (p_scope = 'course' and p.course_id = p_scope_id)
      or (p_scope = 'department' and c.department_id = p_scope_id)
    )
    and case when p_metric = 'rating' then p.rating_count > 0 else coalesce(m.h, 0) > 0 end
  order by
    case when p_metric = 'rating' then p.rating_sum::numeric / nullif(p.rating_count, 0) else m.h end
      desc nulls last,
    p.rating_count desc
  limit 50;
$$;

-- ---------------------------------------------------------------- permissões
revoke all on function
  public.level_for_xp(integer),
  public.publish_session(uuid, timestamptz, timestamptz, text, text, integer),
  public.cancel_session(uuid),
  public.book_session(uuid, timestamptz),
  public.cancel_booking(uuid),
  public.start_session(uuid),
  public.check_in(uuid, text),
  public.end_session(uuid),
  public.submit_review(uuid, integer, text[], text),
  public.redeem_reward(uuid),
  public.grant_semester_credits(numeric),
  public.get_leaderboard(text, text, uuid)
  from public, anon;

grant execute on function
  public.level_for_xp(integer),
  public.publish_session(uuid, timestamptz, timestamptz, text, text, integer),
  public.cancel_session(uuid),
  public.book_session(uuid, timestamptz),
  public.cancel_booking(uuid),
  public.start_session(uuid),
  public.check_in(uuid, text),
  public.end_session(uuid),
  public.submit_review(uuid, integer, text[], text),
  public.redeem_reward(uuid),
  public.grant_semester_credits(numeric),
  public.get_leaderboard(text, text, uuid)
  to authenticated;

revoke all on function private.handle_new_user(), private.award_badges(uuid) from public, anon, authenticated;
