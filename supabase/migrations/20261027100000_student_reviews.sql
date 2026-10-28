-- O monitor avalia o aluno (estrelas, elogios e comentário) e o aluno acumula uma reputação por organização.

create table public.student_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null,
  booking_id uuid not null unique,
  monitor_id uuid not null,
  student_id uuid not null,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  constraint student_reviews_session_fk
    foreign key (org_id, session_id) references public.sessions (org_id, id) on delete cascade,
  constraint student_reviews_booking_fk
    foreign key (org_id, booking_id) references public.session_bookings (org_id, id) on delete cascade,
  constraint student_reviews_monitor_fk
    foreign key (org_id, monitor_id) references public.memberships (org_id, user_id) on delete cascade,
  constraint student_reviews_student_fk
    foreign key (org_id, student_id) references public.memberships (org_id, user_id) on delete cascade
);
create index student_reviews_org_student_idx on public.student_reviews (org_id, student_id, created_at desc);
create index student_reviews_org_monitor_idx on public.student_reviews (org_id, monitor_id);
create index student_reviews_org_session_idx on public.student_reviews (org_id, session_id);
create index student_reviews_org_booking_idx on public.student_reviews (org_id, booking_id);

-- tabela própria: `memberships` é legível por todos os membros e a reputação não pode vazar
create table public.student_reputation (
  org_id uuid not null,
  user_id uuid not null,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  primary key (org_id, user_id),
  constraint student_reputation_user_fk
    foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade
);

alter table public.student_reviews enable row level security;
alter table public.student_reputation enable row level security;

-- lê: o aluno avaliado, o monitor autor e administradores da organização
create policy student_reviews_read on public.student_reviews for select to authenticated
  using (
    (select private.is_member(org_id))
    and (
      student_id = (select auth.uid())
      or monitor_id = (select auth.uid())
      or (select private.is_org_admin(org_id))
    )
  );

-- lê: o próprio aluno, administradores e monitores com esse aluno reservado em alguma sessão sua
create policy student_reputation_read on public.student_reputation for select to authenticated
  using (
    (select private.is_member(org_id))
    and (
      user_id = (select auth.uid())
      or (select private.is_org_admin(org_id))
      or exists (
        select 1
        from public.session_bookings b
        join public.sessions s on s.id = b.session_id
        where b.org_id = student_reputation.org_id
          and b.student_id = student_reputation.user_id
          and s.monitor_id = (select auth.uid())
      )
    )
  );

revoke all on public.student_reviews, public.student_reputation from anon;
revoke insert, update, delete on public.student_reviews, public.student_reputation from authenticated;

-- ---------------------------------------------------------------- avaliar aluno
create function public.submit_student_review(
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
  v_session public.sessions;
begin
  select * into v_booking from public.session_bookings where id = p_booking;
  if not found then raise exception 'Reserva não encontrada.'; end if;

  select * into v_session from public.sessions where id = v_booking.session_id;
  if v_session.monitor_id is distinct from v_uid then
    raise exception 'Apenas o monitor da sessão pode avaliar os alunos.';
  end if;
  perform private.require_member(v_session.org_id);

  if v_session.status <> 'completed' then
    raise exception 'Encerre a sessão antes de avaliar os alunos.';
  end if;
  if v_booking.status not in ('checked_in', 'reviewed') then
    raise exception 'Só é possível avaliar alunos que estiveram presentes.';
  end if;
  if v_session.monitor_ended_at < now() - interval '14 days' then
    raise exception 'O prazo de 14 dias para avaliar este aluno terminou.';
  end if;
  if p_rating not between 1 and 5 then raise exception 'A nota deve ser de 1 a 5.'; end if;
  if exists (select 1 from unnest(coalesce(p_tags, '{}')) t where char_length(t) > 40) then
    raise exception 'Elogio inválido.';
  end if;

  begin
    insert into public.student_reviews (org_id, session_id, booking_id, monitor_id, student_id, rating, tags, comment)
    values (v_session.org_id, v_session.id, p_booking, v_uid, v_booking.student_id,
            p_rating, coalesce(p_tags, '{}'), nullif(trim(p_comment), ''));
  exception when unique_violation then
    raise exception 'Você já avaliou este aluno nesta sessão.';
  end;

  insert into public.student_reputation (org_id, user_id, rating_sum, rating_count)
  values (v_session.org_id, v_booking.student_id, p_rating, 1)
  on conflict (org_id, user_id)
  do update set rating_sum = public.student_reputation.rating_sum + excluded.rating_sum,
                rating_count = public.student_reputation.rating_count + 1;
end;
$$;

-- ---------------------------------------------------------------- pendências do monitor
create function public.my_pending_student_reviews(p_org uuid)
returns table (
  booking_id uuid,
  session_id uuid,
  student_id uuid,
  student_name text,
  subject_name text,
  ended_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select b.id, s.id, b.student_id, p.full_name, sub.name, s.monitor_ended_at
  from public.session_bookings b
  join public.sessions s on s.id = b.session_id and s.org_id = b.org_id
  join public.subjects sub on sub.id = s.subject_id and sub.org_id = s.org_id
  join public.profiles p on p.id = b.student_id
  where b.org_id = p_org
    and s.monitor_id = (select auth.uid())
    and s.status = 'completed'
    and b.status in ('checked_in', 'reviewed')
    and s.monitor_ended_at > now() - interval '14 days'
    and not exists (select 1 from public.student_reviews r where r.booking_id = b.id)
  order by s.monitor_ended_at desc
  limit 20;
$$;

revoke all on function public.submit_student_review(uuid, integer, text[], text) from public, anon;
revoke all on function public.my_pending_student_reviews(uuid) from public, anon;
grant execute on function public.submit_student_review(uuid, integer, text[], text) to authenticated;
grant execute on function public.my_pending_student_reviews(uuid) to authenticated;
