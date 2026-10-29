import { Service, inject } from '@angular/core';

import type { PendingStudentReview, StudentReputation, StudentReview } from '../models';
import { OrgStore } from '../org/org.store';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from './unwrap';

interface RawReview extends Omit<StudentReview, 'subject_name' | 'monitor_name'> {
  session: { subject: { name: string } };
  monitor: { profile: { full_name: string } };
}

/** Avaliações que o monitor faz dos alunos e a reputação resultante. */
@Service()
export class StudentReviewsApi {
  private readonly client = inject(SupabaseService).client;
  private readonly org = inject(OrgStore);

  async submit(bookingId: string, rating: number, tags: string[], comment: string): Promise<void> {
    unwrap(
      await this.client.rpc('submit_student_review', {
        p_booking: bookingId,
        p_rating: rating,
        p_tags: tags,
        p_comment: comment || undefined,
      }),
    );
  }

  /** Notas que o monitor já deu nesta sessão, por reserva. */
  async givenForSession(sessionId: string): Promise<Map<string, number>> {
    const rows = unwrap(
      await this.client
        .from('student_reviews')
        .select('booking_id, rating')
        .eq('org_id', this.org.requireId())
        .eq('session_id', sessionId),
    );
    return new Map(rows.map((r) => [r.booking_id, r.rating]));
  }

  /** Avaliações recebidas pelo aluno nesta organização (a RLS só devolve as dele ou, para admins, as de todos). */
  async received(studentId: string): Promise<StudentReview[]> {
    const rows = unwrap(
      await this.client
        .from('student_reviews')
        .select(
          'id, rating, tags, comment, created_at, session:sessions!student_reviews_session_fk(subject:subjects(name)), monitor:memberships!student_reviews_monitor_fk(profile:profiles!memberships_user_id_fkey(full_name))',
        )
        .eq('org_id', this.org.requireId())
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(30)
        .overrideTypes<RawReview[], { merge: false }>(),
    );
    return rows.map(({ session, monitor, ...rest }) => ({
      ...rest,
      subject_name: session.subject.name,
      monitor_name: monitor.profile.full_name,
    }));
  }

  async reputation(userIds?: string[]): Promise<StudentReputation[]> {
    let query = this.client
      .from('student_reputation')
      .select('user_id, rating_sum, rating_count')
      .eq('org_id', this.org.requireId());
    if (userIds) {
      query = query.in('user_id', userIds);
    }
    return unwrap(await query);
  }

  async pending(): Promise<PendingStudentReview[]> {
    return unwrap(
      await this.client.rpc('my_pending_student_reviews', { p_org: this.org.requireId() }),
    ) as PendingStudentReview[];
  }
}
