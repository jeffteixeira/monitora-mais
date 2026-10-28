import { Service, inject } from '@angular/core';

import { OrgStore } from '../org/org.store';
import type { Booking, MonitorSummary, Session, SessionMode } from '../models';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from './unwrap';

const SESSION_COLUMNS =
  '*, subject:subjects(id,name,code), monitor:memberships!sessions_monitor_fk(user_id,xp,rating_sum,rating_count,profile:profiles!memberships_user_id_fkey(full_name))';

interface RawMonitor {
  user_id: string;
  xp: number;
  rating_sum: number;
  rating_count: number;
  profile: { full_name: string };
}
type RawSession = Omit<Session, 'taken' | 'monitor'> & { monitor: RawMonitor };

const toMonitor = (m: RawMonitor): MonitorSummary => ({
  id: m.user_id,
  full_name: m.profile.full_name,
  xp: m.xp,
  rating_sum: m.rating_sum,
  rating_count: m.rating_count,
});
const toSession = (r: RawSession): Omit<Session, 'taken'> => ({ ...r, monitor: toMonitor(r.monitor) });

export interface PublishInput {
  subjectId: string;
  startsAt: string;
  endsAt: string;
  mode: SessionMode;
  location: string;
  capacity: number;
  inApp: boolean;
}

export interface SessionAttendee {
  id: string;
  status: Booking['status'];
  student: { id: string; full_name: string };
}

@Service()
export class SessionsApi {
  private readonly client = inject(SupabaseService).client;
  private readonly org = inject(OrgStore);

  /** Monitorias abertas e futuras, opcionalmente filtradas por matéria ou monitor. */
  async listOpen(filter: { subjectId?: string; monitorId?: string } = {}): Promise<Session[]> {
    let query = this.client
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('org_id', this.org.requireId())
      .eq('status', 'open')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at');
    if (filter.subjectId) {
      query = query.eq('subject_id', filter.subjectId);
    }
    if (filter.monitorId) {
      query = query.eq('monitor_id', filter.monitorId);
    }
    const rows = unwrap(await query.returns<RawSession[]>());
    return this.withTaken(rows.map(toSession));
  }

  async get(id: string): Promise<Session> {
    const row = unwrap(
      await this.client
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('org_id', this.org.requireId())
        .eq('id', id)
        .single<RawSession>(),
    );
    return (await this.withTaken([toSession(row)]))[0];
  }

  /** Monitorias que eu ministro (ou ministrei). */
  async teaching(monitorId: string): Promise<Session[]> {
    const rows = unwrap(
      await this.client
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('org_id', this.org.requireId())
        .eq('monitor_id', monitorId)
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: false })
        .limit(50)
        .returns<RawSession[]>(),
    );
    return this.withTaken(rows.map(toSession));
  }

  async myBookings(studentId: string): Promise<Booking[]> {
    const rows = unwrap(
      await this.client
        .from('session_bookings')
        .select(`*, session:sessions!session_bookings_session_fk(${SESSION_COLUMNS})`)
        .eq('org_id', this.org.requireId())
        .eq('student_id', studentId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .returns<(Omit<Booking, 'session'> & { session: RawSession })[]>(),
    );
    return rows.map((r) => ({ ...r, session: toSession(r.session) }));
  }

  async myBooking(
    sessionId: string,
    studentId: string,
  ): Promise<{ id: string; status: Booking['status'] } | null> {
    const row = await this.client
      .from('session_bookings')
      .select('id, status')
      .eq('org_id', this.org.requireId())
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .neq('status', 'cancelled')
      .maybeSingle();
    return row.data ? { id: row.data.id, status: row.data.status as Booking['status'] } : null;
  }

  async attendees(sessionId: string): Promise<SessionAttendee[]> {
    const rows = unwrap(
      await this.client
        .from('session_bookings')
        .select('id, status, student:memberships!session_bookings_student_fk(user_id, profile:profiles!memberships_user_id_fkey(full_name))')
        .eq('org_id', this.org.requireId())
        .eq('session_id', sessionId)
        .neq('status', 'cancelled')
        .returns<
          { id: string; status: Booking['status']; student: { user_id: string; profile: { full_name: string } } }[]
        >(),
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      student: { id: r.student.user_id, full_name: r.student.profile.full_name },
    }));
  }

  async monitorCode(sessionId: string): Promise<string | null> {
    const row = await this.client
      .from('session_codes')
      .select('code')
      .eq('session_id', sessionId)
      .maybeSingle();
    return row.data?.code ?? null;
  }

  async publish(input: PublishInput): Promise<string> {
    return unwrap(
      await this.client.rpc('publish_session', {
        p_org: this.org.requireId(),
        p_subject: input.subjectId,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_mode: input.mode,
        p_location: input.location,
        p_capacity: input.capacity,
        p_in_app: input.inApp,
      }),
    ) as string;
  }

  async book(sessionId: string, examAt: string | null): Promise<void> {
    unwrap(
      await this.client.rpc('book_session', { p_session: sessionId, p_exam_at: examAt ?? undefined }),
    );
  }

  async cancelBooking(bookingId: string): Promise<void> {
    unwrap(await this.client.rpc('cancel_booking', { p_booking: bookingId }));
  }

  async cancelSession(sessionId: string): Promise<void> {
    unwrap(await this.client.rpc('cancel_session', { p_session: sessionId }));
  }

  async start(sessionId: string): Promise<string> {
    return unwrap(await this.client.rpc('start_session', { p_session: sessionId })) as string;
  }

  async checkIn(sessionId: string, code: string): Promise<void> {
    unwrap(await this.client.rpc('check_in', { p_session: sessionId, p_code: code }));
  }

  async end(sessionId: string): Promise<number> {
    return Number(unwrap(await this.client.rpc('end_session', { p_session: sessionId })));
  }

  async review(bookingId: string, rating: number, tags: string[], comment: string): Promise<void> {
    unwrap(
      await this.client.rpc('submit_review', {
        p_booking: bookingId,
        p_rating: rating,
        p_tags: tags,
        p_comment: comment || undefined,
      }),
    );
  }

  /** Atualizações em tempo real de uma monitoria e das inscrições visíveis ao usuário. */
  watch(sessionId: string, onChange: () => void): () => void {
    const channel = this.client
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_bookings', filter: `session_id=eq.${sessionId}` },
        onChange,
      )
      .subscribe();
    return () => void this.client.removeChannel(channel);
  }

  private async withTaken(rows: Omit<Session, 'taken'>[]): Promise<Session[]> {
    if (rows.length === 0) {
      return [];
    }
    const taken = unwrap(
      await this.client.rpc('session_taken', { p_ids: rows.map((r) => r.id) }),
    ) as { session_id: string; taken: number }[];
    const byId = new Map(taken.map((t) => [t.session_id, Number(t.taken)]));
    return rows.map((r) => ({ ...r, taken: byId.get(r.id) ?? 0 }));
  }
}
