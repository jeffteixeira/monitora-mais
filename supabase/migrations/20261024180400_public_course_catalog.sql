-- O cadastro precisa listar cursos antes do login (role anon).
grant select on public.courses to anon;
create policy courses_read_anon on public.courses for select to anon using (true);
