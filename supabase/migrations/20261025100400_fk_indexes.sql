-- Índices para as FKs compostas que o advisor apontou como descobertas.
create index monitor_subjects_org_monitor_idx on public.monitor_subjects (org_id, monitor_id);
create index reviews_org_booking_idx on public.reviews (org_id, booking_id);
