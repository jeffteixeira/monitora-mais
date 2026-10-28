-- Monitora+ : esquema base (banco de tempo + gamificação)

create extension if not exists btree_gist with schema extensions;
create schema if not exists private;

-- ---------------------------------------------------------------- catálogo
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  name text not null unique
);
create index courses_department_id_idx on public.courses (department_id);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  code text not null unique,
  name text not null,
  difficulty smallint not null default 1 check (difficulty between 1 and 3)
);
create index subjects_department_id_idx on public.subjects (department_id);

-- ---------------------------------------------------------------- perfis
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  course_id uuid references public.courses (id) on delete set null,
  bio text check (char_length(bio) <= 500),
  avatar_url text,
  role text not null default 'student' check (role in ('student', 'admin')),
  xp integer not null default 0 check (xp >= 0),
  hours_given numeric(8, 2) not null default 0,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index profiles_course_id_idx on public.profiles (course_id);

create table public.monitor_subjects (
  monitor_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  primary key (monitor_id, subject_id)
);
create index monitor_subjects_subject_id_idx on public.monitor_subjects (subject_id);

-- ---------------------------------------------------------------- sessões
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null check (mode in ('presencial', 'online')),
  location text not null check (char_length(location) between 2 and 200),
  capacity smallint not null default 1 check (capacity between 1 and 10),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  monitor_started_at timestamptz,
  monitor_ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at between interval '30 minutes' and interval '4 hours'),
  constraint sessions_no_overlap exclude using gist (
    monitor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
create index sessions_subject_starts_idx on public.sessions (subject_id, starts_at);
create index sessions_monitor_starts_idx on public.sessions (monitor_id, starts_at);
create index sessions_open_idx on public.sessions (starts_at) where status = 'open';

-- código de check-in fica em tabela própria: só o monitor da sessão lê
create table public.session_codes (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  code char(6) not null
);

create table public.session_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'booked'
    check (status in ('booked', 'checked_in', 'reviewed', 'cancelled', 'no_show')),
  exam_at timestamptz,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index session_bookings_student_idx on public.session_bookings (student_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.session_bookings (id) on delete cascade,
  monitor_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index reviews_monitor_idx on public.reviews (monitor_id, created_at desc);
create index reviews_student_idx on public.reviews (student_id);

-- ---------------------------------------------------------------- banco de tempo
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  kind text not null check (kind in ('horas_complementares', 'acesso', 'vantagem')),
  cost numeric(6, 2) not null check (cost > 0),
  active boolean not null default true
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete restrict,
  cost numeric(6, 2) not null,
  verification_code text not null unique,
  created_at timestamptz not null default now()
);
create index redemptions_user_idx on public.redemptions (user_id, created_at desc);
create index redemptions_reward_idx on public.redemptions (reward_id);

-- livro-razão imutável: saldo = soma das transações
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(6, 2) not null check (amount <> 0),
  kind text not null
    check (kind in ('initial_grant', 'hold', 'hold_release', 'earning', 'redemption')),
  booking_id uuid references public.session_bookings (id) on delete set null,
  redemption_id uuid references public.redemptions (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index credit_transactions_user_idx on public.credit_transactions (user_id, created_at desc);
create index credit_transactions_booking_idx on public.credit_transactions (booking_id);
create index credit_transactions_redemption_idx on public.credit_transactions (redemption_id);

create view public.wallet_balances with (security_invoker = true) as
  select user_id, sum(amount)::numeric(8, 2) as balance
  from public.credit_transactions
  group by user_id;

-- ---------------------------------------------------------------- badges
create table public.badges (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null
);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_code text not null references public.badges (code) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);
create index user_badges_badge_idx on public.user_badges (badge_code);

-- ---------------------------------------------------------------- RLS
alter table public.departments enable row level security;
alter table public.courses enable row level security;
alter table public.subjects enable row level security;
alter table public.profiles enable row level security;
alter table public.monitor_subjects enable row level security;
alter table public.sessions enable row level security;
alter table public.session_codes enable row level security;
alter table public.session_bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

create policy departments_read on public.departments for select to authenticated using (true);
create policy courses_read on public.courses for select to authenticated using (true);
create policy subjects_read on public.subjects for select to authenticated using (true);
create policy badges_read on public.badges for select to authenticated using (true);
create policy user_badges_read on public.user_badges for select to authenticated using (true);
create policy rewards_read on public.rewards for select to authenticated using (active);
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy sessions_read on public.sessions for select to authenticated using (true);
create policy reviews_read on public.reviews for select to authenticated using (true);
create policy monitor_subjects_read on public.monitor_subjects for select to authenticated using (true);

create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy monitor_subjects_insert on public.monitor_subjects for insert to authenticated
  with check ((select auth.uid()) = monitor_id);
create policy monitor_subjects_delete on public.monitor_subjects for delete to authenticated
  using ((select auth.uid()) = monitor_id);

create policy session_codes_monitor_read on public.session_codes for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.monitor_id = (select auth.uid())
  ));

create policy bookings_read on public.session_bookings for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (
      select 1 from public.sessions s
      where s.id = session_id and s.monitor_id = (select auth.uid())
    )
  );

create policy redemptions_read_own on public.redemptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy credit_transactions_read_own on public.credit_transactions for select to authenticated
  using (user_id = (select auth.uid()));

-- escrita sensível só via RPC: remove privilégios diretos
revoke insert, update, delete on
  public.sessions, public.session_codes, public.session_bookings, public.reviews,
  public.rewards, public.redemptions, public.credit_transactions, public.badges,
  public.user_badges, public.departments, public.courses, public.subjects
  from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (full_name, course_id, bio, avatar_url) on public.profiles to authenticated;

-- realtime para o fluxo de check-in
alter publication supabase_realtime add table public.sessions, public.session_bookings;
