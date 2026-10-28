-- Vagas ocupadas por monitoria, sem expor quem reservou (RLS esconde reservas alheias).
create function public.session_taken(p_ids uuid[])
returns table (session_id uuid, taken integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.session_id, count(*)::int
  from public.session_bookings b
  where b.session_id = any (p_ids)
    and b.status in ('booked', 'checked_in', 'reviewed')
  group by b.session_id;
$$;

revoke all on function public.session_taken(uuid[]) from public, anon;
grant execute on function public.session_taken(uuid[]) to authenticated;
