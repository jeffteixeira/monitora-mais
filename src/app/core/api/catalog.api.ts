import { Service, inject } from '@angular/core';

import { OrgStore } from '../org/org.store';
import type { Course, Department, Subject } from '../models';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from './unwrap';

@Service()
export class CatalogApi {
  private readonly client = inject(SupabaseService).client;
  private readonly org = inject(OrgStore);

  async departments(): Promise<Department[]> {
    return unwrap(
      await this.client.from('departments').select('*').eq('org_id', this.org.requireId()).order('name'),
    );
  }

  async courses(): Promise<Course[]> {
    return unwrap(
      await this.client.from('courses').select('*').eq('org_id', this.org.requireId()).order('name'),
    );
  }

  async subjects(): Promise<Subject[]> {
    return unwrap(
      await this.client.from('subjects').select('*').eq('org_id', this.org.requireId()).order('name'),
    );
  }

  async monitorSubjectIds(monitorId: string): Promise<string[]> {
    const rows = unwrap(
      await this.client
        .from('monitor_subjects')
        .select('subject_id')
        .eq('org_id', this.org.requireId())
        .eq('monitor_id', monitorId),
    );
    return rows.map((r) => r.subject_id);
  }

  async addMonitorSubject(monitorId: string, subjectId: string): Promise<void> {
    unwrap(
      await this.client
        .from('monitor_subjects')
        .insert({ org_id: this.org.requireId(), monitor_id: monitorId, subject_id: subjectId }),
    );
  }

  async removeMonitorSubject(monitorId: string, subjectId: string): Promise<void> {
    unwrap(
      await this.client
        .from('monitor_subjects')
        .delete()
        .eq('org_id', this.org.requireId())
        .eq('monitor_id', monitorId)
        .eq('subject_id', subjectId),
    );
  }
}
