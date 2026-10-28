-- Monitora+ multi-tenant (2/3): RLS por organização.

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

-- remove políticas antigas (globais)
drop policy departments_read on public.departments;
drop policy courses_read on public.courses;
drop policy courses_read_anon on public.courses;
drop policy subjects_read on public.subjects;
drop policy user_badges_read on public.user_badges;
drop policy rewards_read on public.rewards;
drop policy profiles_read on public.profiles;
drop policy sessions_read on public.sessions;
drop policy reviews_read on public.reviews;
drop policy monitor_subjects_read on public.monitor_subjects;
drop policy monitor_subjects_insert on public.monitor_subjects;
drop policy monitor_subjects_delete on public.monitor_subjects;
drop policy redemptions_read_own on public.redemptions;
drop policy credit_transactions_read_own on public.credit_transactions;

revoke all on public.courses from anon;

-- organizações e membros: só quem participa enxerga (escrita via RPC)
create policy organizations_read on public.organizations for select to authenticated
  using ((select private.is_member(id)));
create policy memberships_read on public.memberships for select to authenticated
  using ((select private.is_member(org_id)));

-- identidade global: o próprio usuário ou quem divide uma organização com ele
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_org(id)));

-- dados operacionais: leitura restrita aos membros da organização
create policy sessions_read on public.sessions for select to authenticated
  using ((select private.is_member(org_id)));
create policy reviews_read on public.reviews for select to authenticated
  using ((select private.is_member(org_id)));
create policy user_badges_read on public.user_badges for select to authenticated
  using ((select private.is_member(org_id)));
create policy monitor_subjects_read on public.monitor_subjects for select to authenticated
  using ((select private.is_member(org_id)));
create policy redemptions_read_own on public.redemptions for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member(org_id)));
create policy credit_transactions_read_own on public.credit_transactions for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member(org_id)));

create policy monitor_subjects_insert on public.monitor_subjects for insert to authenticated
  with check (monitor_id = (select auth.uid()) and (select private.is_member(org_id)));
create policy monitor_subjects_delete on public.monitor_subjects for delete to authenticated
  using (monitor_id = (select auth.uid()) and (select private.is_member(org_id)));

-- catálogo e recompensas: membros leem, administradores gerenciam
create policy departments_read on public.departments for select to authenticated
  using ((select private.is_member(org_id)));
create policy courses_read on public.courses for select to authenticated
  using ((select private.is_member(org_id)));
create policy subjects_read on public.subjects for select to authenticated
  using ((select private.is_member(org_id)));
create policy rewards_read on public.rewards for select to authenticated
  using ((select private.is_member(org_id)) and (active or (select private.is_org_admin(org_id))));

create policy departments_admin_insert on public.departments for insert to authenticated
  with check ((select private.is_org_admin(org_id)));
create policy departments_admin_update on public.departments for update to authenticated
  using ((select private.is_org_admin(org_id))) with check ((select private.is_org_admin(org_id)));
create policy departments_admin_delete on public.departments for delete to authenticated
  using ((select private.is_org_admin(org_id)));

create policy courses_admin_insert on public.courses for insert to authenticated
  with check ((select private.is_org_admin(org_id)));
create policy courses_admin_update on public.courses for update to authenticated
  using ((select private.is_org_admin(org_id))) with check ((select private.is_org_admin(org_id)));
create policy courses_admin_delete on public.courses for delete to authenticated
  using ((select private.is_org_admin(org_id)));

create policy subjects_admin_insert on public.subjects for insert to authenticated
  with check ((select private.is_org_admin(org_id)));
create policy subjects_admin_update on public.subjects for update to authenticated
  using ((select private.is_org_admin(org_id))) with check ((select private.is_org_admin(org_id)));
create policy subjects_admin_delete on public.subjects for delete to authenticated
  using ((select private.is_org_admin(org_id)));

create policy rewards_admin_insert on public.rewards for insert to authenticated
  with check ((select private.is_org_admin(org_id)));
create policy rewards_admin_update on public.rewards for update to authenticated
  using ((select private.is_org_admin(org_id))) with check ((select private.is_org_admin(org_id)));
create policy rewards_admin_delete on public.rewards for delete to authenticated
  using ((select private.is_org_admin(org_id)));

grant insert, update, delete on public.departments, public.courses, public.subjects, public.rewards to authenticated;
revoke all on public.organizations, public.memberships from anon;
revoke insert, update, delete on public.organizations, public.memberships from authenticated;
