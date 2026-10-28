-- O curso do membro é por organização; a escrita em memberships passa por RPC.
create function public.set_my_course(p_org uuid, p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_org);
  update public.memberships set course_id = p_course
  where org_id = p_org and user_id = (select auth.uid());
end;
$$;

revoke all on function public.set_my_course(uuid, uuid) from public, anon;
grant execute on function public.set_my_course(uuid, uuid) to authenticated;
