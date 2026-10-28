import { Service, inject } from '@angular/core';

import type { Badge, LeaderboardEntry, Review } from '../models';
import { OrgStore } from '../org/org.store';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from './unwrap';

export type LeaderboardMetric = 'hours_month' | 'rating';
export type LeaderboardScope = 'campus' | 'course' | 'department';

@Service()
export class GamificationApi {
  private readonly client = inject(SupabaseService).client;
  private readonly org = inject(OrgStore);

  async badges(): Promise<Badge[]> {
    return unwrap(await this.client.from('badges').select('*')) as Badge[];
  }

  async earnedBadgeCodes(userId: string): Promise<string[]> {
    const rows = unwrap(
      await this.client
        .from('user_badges')
        .select('badge_code')
        .eq('org_id', this.org.requireId())
        .eq('user_id', userId),
    );
    return rows.map((r) => r.badge_code);
  }

  async leaderboard(
    metric: LeaderboardMetric,
    scope: LeaderboardScope,
    scopeId: string | null,
  ): Promise<LeaderboardEntry[]> {
    return unwrap(
      await this.client.rpc('get_leaderboard', {
        p_org: this.org.requireId(),
        p_metric: metric,
        p_scope: scope,
        p_scope_id: scopeId ?? undefined,
      }),
    ) as LeaderboardEntry[];
  }

  async reviews(monitorId: string): Promise<Review[]> {
    return unwrap(
      await this.client
        .from('reviews')
        .select('id, rating, tags, comment, created_at')
        .eq('org_id', this.org.requireId())
        .eq('monitor_id', monitorId)
        .order('created_at', { ascending: false })
        .limit(20),
    ) as Review[];
  }
}
