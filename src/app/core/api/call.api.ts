import { Service, inject } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { OrgStore } from '../org/org.store';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from './unwrap';

export interface CallConnection {
  token: string;
  url: string;
  role: 'monitor' | 'student';
}

export interface PresenceRow {
  user_id: string;
  joined_at: string;
  left_at: string | null;
}

async function readFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) {
      return body.error;
    }
  }
  return 'Não foi possível entrar na chamada. Verifique sua conexão e tente novamente.';
}

@Service()
export class CallApi {
  private readonly client = inject(SupabaseService).client;
  private readonly org = inject(OrgStore);

  /** Pede ao backend o token da sala; ele decide se o usuário pode entrar agora. */
  async connection(sessionId: string): Promise<CallConnection> {
    const { data, error } = await this.client.functions.invoke('livekit-token', {
      body: { session_id: sessionId },
    });
    if (error) {
      throw new Error(await readFunctionError(error));
    }
    return data as CallConnection;
  }

  /** Fecha a sala depois que a sessão termina (best-effort: a sessão já foi encerrada). */
  async closeRoom(sessionId: string): Promise<void> {
    await this.client.functions
      .invoke('livekit-token', { body: { session_id: sessionId, action: 'close' } })
      .catch(() => undefined);
  }

  async presence(sessionId: string): Promise<PresenceRow[]> {
    return unwrap(
      await this.client
        .from('session_presence')
        .select('user_id, joined_at, left_at')
        .eq('org_id', this.org.requireId())
        .eq('session_id', sessionId),
    ) as PresenceRow[];
  }

  async monthlyUsage(): Promise<{ minutes: number; calls: number }> {
    const rows = unwrap(
      await this.client.rpc('org_call_usage', { p_org: this.org.requireId() }),
    ) as { minutes: number; calls: number }[];
    return rows[0] ?? { minutes: 0, calls: 0 };
  }
}
