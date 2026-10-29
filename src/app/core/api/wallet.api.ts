import { Service, inject } from '@angular/core';

import type { CreditTransaction, Redemption, Reward } from '../models';
import { OrgStore } from '../org/org.store';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from './unwrap';

@Service()
export class WalletApi {
  private readonly client = inject(SupabaseService).client;
  private readonly org = inject(OrgStore);

  async transactions(): Promise<CreditTransaction[]> {
    return unwrap(
      await this.client
        .from('credit_transactions')
        .select('id, amount, kind, note, created_at')
        .eq('org_id', this.org.requireId())
        .order('created_at', { ascending: false })
        .limit(100),
    ) as CreditTransaction[];
  }

  async rewards(): Promise<Reward[]> {
    return unwrap(
      await this.client
        .from('rewards')
        .select('*')
        .eq('org_id', this.org.requireId())
        .eq('active', true)
        .order('cost'),
    ) as Reward[];
  }

  async redemptions(): Promise<Redemption[]> {
    return unwrap(
      await this.client
        .from('redemptions')
        .select('id, cost, verification_code, created_at, reward:rewards(title, kind)')
        .eq('org_id', this.org.requireId())
        .order('created_at', { ascending: false })
        .overrideTypes<Redemption[], { merge: false }>(),
    );
  }

  async redeem(rewardId: string): Promise<string> {
    return unwrap(await this.client.rpc('redeem_reward', { p_reward: rewardId })) as string;
  }
}
