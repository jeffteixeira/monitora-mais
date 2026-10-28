import { Service, computed, inject, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';

import { unwrap } from '../api/unwrap';
import type { Profile } from '../models';
import { SupabaseService } from '../supabase/supabase.service';

/** Usuário autenticado + identidade global. Dados por organização ficam no OrgStore. */
@Service()
export class AuthStore {
  private readonly client = inject(SupabaseService).client;

  readonly user = signal<User | null>(null);
  readonly profile = signal<Profile | null>(null);

  readonly isAuthenticated = computed(() => this.user() !== null);

  private readonly initialized = this.init();

  whenReady(): Promise<void> {
    return this.initialized;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message,
      );
    }
    // atualiza o estado já, para o guard da próxima rota enxergar o usuário logado
    await this.apply(data.user);
  }

  /** Retorna true quando o projeto exige confirmação de e-mail antes do primeiro acesso. */
  async signUp(email: string, password: string, fullName: string): Promise<boolean> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data.session) {
      await this.apply(data.session.user);
    }
    return data.session === null;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
    await this.apply(null);
  }

  async refreshProfile(): Promise<void> {
    const user = this.user();
    if (!user) {
      return;
    }
    this.profile.set(
      unwrap(await this.client.from('profiles').select('*').eq('id', user.id).single()) as Profile,
    );
  }

  private async init(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    await this.apply(data.session?.user ?? null);

    this.client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      if (next?.id === this.user()?.id) {
        return;
      }
      // evita chamadas ao Supabase dentro do próprio callback (risco de deadlock)
      setTimeout(() => void this.apply(next));
    });
  }

  private async apply(user: User | null): Promise<void> {
    this.user.set(user);
    if (user) {
      await this.refreshProfile();
    } else {
      this.profile.set(null);
    }
  }
}
