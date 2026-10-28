-- Monitora+ multi-tenant (1/3): organizações, memberships, org_id e backfill.

-- ---------------------------------------------------------------- organizações
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  welcome_credits numeric(6, 2) not null default 5 check (welcome_credits >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index organizations_created_by_idx on public.organizations (created_by);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'left')),
  course_id uuid,
  xp integer not null default 0 check (xp >= 0),
  hours_given numeric(8, 2) not null default 0,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------- backfill: org piloto
insert into public.organizations (slug, name, description, created_by)
values (
  'piloto', 'Campus Piloto', 'Organização criada na migração para multi-tenant.',
  (select id from public.profiles order by created_at limit 1)
);

alter table public.departments add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.courses add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.subjects add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.monitor_subjects add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.sessions add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.session_bookings add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.reviews add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.rewards add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.redemptions add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.credit_transactions add column org_id uuid references public.organizations (id) on delete cascade;
alter table public.user_badges add column org_id uuid references public.organizations (id) on delete cascade;

update public.departments set org_id = (select id from public.organizations where slug = 'piloto');
update public.courses set org_id = (select id from public.organizations where slug = 'piloto');
update public.subjects set org_id = (select id from public.organizations where slug = 'piloto');
update public.monitor_subjects set org_id = (select id from public.organizations where slug = 'piloto');
update public.sessions set org_id = (select id from public.organizations where slug = 'piloto');
update public.session_bookings set org_id = (select id from public.organizations where slug = 'piloto');
update public.reviews set org_id = (select id from public.organizations where slug = 'piloto');
update public.rewards set org_id = (select id from public.organizations where slug = 'piloto');
update public.redemptions set org_id = (select id from public.organizations where slug = 'piloto');
update public.credit_transactions set org_id = (select id from public.organizations where slug = 'piloto');
update public.user_badges set org_id = (select id from public.organizations where slug = 'piloto');

insert into public.memberships (org_id, user_id, role, course_id, xp, hours_given, rating_sum, rating_count)
select o.id, p.id, case when p.id = o.created_by then 'owner' else 'member' end,
       p.course_id, p.xp, p.hours_given, p.rating_sum, p.rating_count
from public.profiles p
cross join public.organizations o
where o.slug = 'piloto';

alter table public.departments alter column org_id set not null;
alter table public.courses alter column org_id set not null;
alter table public.subjects alter column org_id set not null;
alter table public.monitor_subjects alter column org_id set not null;
alter table public.sessions alter column org_id set not null;
alter table public.session_bookings alter column org_id set not null;
alter table public.reviews alter column org_id set not null;
alter table public.rewards alter column org_id set not null;
alter table public.redemptions alter column org_id set not null;
alter table public.credit_transactions alter column org_id set not null;
alter table public.user_badges alter column org_id set not null;

-- ---------------------------------------------------------------- unicidade por organização
alter table public.departments drop constraint departments_name_key;
alter table public.departments add constraint departments_org_name_key unique (org_id, name);
alter table public.departments add constraint departments_org_id_key unique (org_id, id);

alter table public.courses drop constraint courses_name_key;
alter table public.courses drop constraint courses_department_id_fkey;
alter table public.courses add constraint courses_org_name_key unique (org_id, name);
alter table public.courses add constraint courses_org_id_key unique (org_id, id);
alter table public.courses add constraint courses_department_fk
  foreign key (org_id, department_id) references public.departments (org_id, id) on delete restrict;

alter table public.subjects drop constraint subjects_code_key;
alter table public.subjects drop constraint subjects_department_id_fkey;
alter table public.subjects add constraint subjects_org_code_key unique (org_id, code);
alter table public.subjects add constraint subjects_org_id_key unique (org_id, id);
alter table public.subjects add constraint subjects_department_fk
  foreign key (org_id, department_id) references public.departments (org_id, id) on delete restrict;

alter table public.rewards add constraint rewards_org_id_key unique (org_id, id);

-- ---------------------------------------------------------------- FKs compostas (integridade entre tenants)
alter table public.memberships add constraint memberships_course_fk
  foreign key (org_id, course_id) references public.courses (org_id, id) on delete set null (course_id);

alter table public.monitor_subjects drop constraint monitor_subjects_monitor_id_fkey;
alter table public.monitor_subjects drop constraint monitor_subjects_subject_id_fkey;
alter table public.monitor_subjects add constraint monitor_subjects_monitor_fk
  foreign key (org_id, monitor_id) references public.memberships (org_id, user_id) on delete cascade;
alter table public.monitor_subjects add constraint monitor_subjects_subject_fk
  foreign key (org_id, subject_id) references public.subjects (org_id, id) on delete cascade;

alter table public.sessions drop constraint sessions_monitor_id_fkey;
alter table public.sessions drop constraint sessions_subject_id_fkey;
alter table public.sessions add constraint sessions_org_id_key unique (org_id, id);
alter table public.sessions add constraint sessions_monitor_fk
  foreign key (org_id, monitor_id) references public.memberships (org_id, user_id) on delete cascade;
alter table public.sessions add constraint sessions_subject_fk
  foreign key (org_id, subject_id) references public.subjects (org_id, id) on delete restrict;

alter table public.session_bookings drop constraint session_bookings_session_id_fkey;
alter table public.session_bookings drop constraint session_bookings_student_id_fkey;
alter table public.session_bookings add constraint session_bookings_org_id_key unique (org_id, id);
alter table public.session_bookings add constraint session_bookings_session_fk
  foreign key (org_id, session_id) references public.sessions (org_id, id) on delete cascade;
alter table public.session_bookings add constraint session_bookings_student_fk
  foreign key (org_id, student_id) references public.memberships (org_id, user_id) on delete cascade;

alter table public.reviews drop constraint reviews_booking_id_fkey;
alter table public.reviews drop constraint reviews_monitor_id_fkey;
alter table public.reviews drop constraint reviews_student_id_fkey;
alter table public.reviews add constraint reviews_booking_fk
  foreign key (org_id, booking_id) references public.session_bookings (org_id, id) on delete cascade;
alter table public.reviews add constraint reviews_monitor_fk
  foreign key (org_id, monitor_id) references public.memberships (org_id, user_id) on delete cascade;
alter table public.reviews add constraint reviews_student_fk
  foreign key (org_id, student_id) references public.memberships (org_id, user_id) on delete cascade;

alter table public.redemptions drop constraint redemptions_reward_id_fkey;
alter table public.redemptions drop constraint redemptions_user_id_fkey;
alter table public.redemptions add constraint redemptions_org_id_key unique (org_id, id);
alter table public.redemptions add constraint redemptions_reward_fk
  foreign key (org_id, reward_id) references public.rewards (org_id, id) on delete restrict;
alter table public.redemptions add constraint redemptions_user_fk
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade;

alter table public.credit_transactions drop constraint credit_transactions_user_id_fkey;
alter table public.credit_transactions drop constraint credit_transactions_booking_id_fkey;
alter table public.credit_transactions drop constraint credit_transactions_redemption_id_fkey;
alter table public.credit_transactions add constraint credit_transactions_user_fk
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade;
alter table public.credit_transactions add constraint credit_transactions_booking_fk
  foreign key (org_id, booking_id) references public.session_bookings (org_id, id) on delete set null (booking_id);
alter table public.credit_transactions add constraint credit_transactions_redemption_fk
  foreign key (org_id, redemption_id) references public.redemptions (org_id, id) on delete set null (redemption_id);

alter table public.user_badges drop constraint user_badges_pkey;
alter table public.user_badges drop constraint user_badges_user_id_fkey;
alter table public.user_badges add primary key (org_id, user_id, badge_code);
alter table public.user_badges add constraint user_badges_user_fk
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade;

-- índices de FK (org_id sempre primeiro) e filtros comuns
create index departments_org_idx on public.departments (org_id);
create index courses_org_dept_idx on public.courses (org_id, department_id);
create index subjects_org_dept_idx on public.subjects (org_id, department_id);
create index rewards_org_idx on public.rewards (org_id);
create index monitor_subjects_org_subject_idx on public.monitor_subjects (org_id, subject_id);
create index sessions_org_subject_starts_idx on public.sessions (org_id, subject_id, starts_at);
create index sessions_org_monitor_idx on public.sessions (org_id, monitor_id, starts_at);
create index session_bookings_org_student_idx on public.session_bookings (org_id, student_id);
create index session_bookings_org_session_idx on public.session_bookings (org_id, session_id);
create index reviews_org_monitor_idx on public.reviews (org_id, monitor_id, created_at desc);
create index reviews_org_student_idx on public.reviews (org_id, student_id);
create index redemptions_org_user_idx on public.redemptions (org_id, user_id, created_at desc);
create index redemptions_org_reward_idx on public.redemptions (org_id, reward_id);
create index credit_transactions_org_user_idx on public.credit_transactions (org_id, user_id, created_at desc);
create index credit_transactions_org_booking_idx on public.credit_transactions (org_id, booking_id);
create index credit_transactions_org_redemption_idx on public.credit_transactions (org_id, redemption_id);
create index memberships_org_course_idx on public.memberships (org_id, course_id);
-- os índices antigos de uma coluna só ficam redundantes
drop index if exists public.courses_department_id_idx;
drop index if exists public.subjects_department_id_idx;
drop index if exists public.monitor_subjects_subject_id_idx;
drop index if exists public.sessions_subject_starts_idx;
drop index if exists public.sessions_monitor_starts_idx;
drop index if exists public.session_bookings_student_idx;
drop index if exists public.reviews_monitor_idx;
drop index if exists public.reviews_student_idx;
drop index if exists public.redemptions_user_idx;
drop index if exists public.redemptions_reward_idx;
drop index if exists public.credit_transactions_user_idx;
drop index if exists public.credit_transactions_booking_idx;
drop index if exists public.credit_transactions_redemption_idx;

-- ---------------------------------------------------------------- profiles vira só identidade global
drop view public.wallet_balances;
alter table public.profiles
  drop column course_id,
  drop column role,
  drop column xp,
  drop column hours_given,
  drop column rating_sum,
  drop column rating_count;

create view public.wallet_balances with (security_invoker = true) as
  select org_id, user_id, sum(amount)::numeric(8, 2) as balance
  from public.credit_transactions
  group by org_id, user_id;

-- ---------------------------------------------------------------- helpers de autorização (schema não exposto)
create function private.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create function private.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin')
  );
$$;

create function private.shares_org(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships a
    join public.memberships b on b.org_id = a.org_id
    where a.user_id = (select auth.uid()) and a.status = 'active' and b.user_id = p_user
  );
$$;

create function private.require_member(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_org) then
    raise exception 'Você não faz parte desta organização.';
  end if;
end;
$$;

create function private.require_admin(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_admin(p_org) then
    raise exception 'Apenas administradores da organização podem fazer isso.';
  end if;
end;
$$;

grant usage on schema private to authenticated;
revoke all on function private.is_member(uuid), private.is_org_admin(uuid), private.shares_org(uuid),
  private.require_member(uuid), private.require_admin(uuid) from public, anon;
grant execute on function private.is_member(uuid), private.is_org_admin(uuid), private.shares_org(uuid) to authenticated;
