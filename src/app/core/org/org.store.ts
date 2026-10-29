import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, computed, inject, signal } from '@angular/core';

import { unwrap } from '../api/unwrap';
import { AuthStore } from '../auth/auth.store';
import type { Membership, Organization } from '../models';
import { SupabaseService } from '../supabase/supabase.service';
import { levelFor } from '../util/level';

const LAST_ORG_KEY = 'monitora:last-org';

interface MembershipRow extends Omit<Membership, 'org'> {
  organization: Organization;
}

/** Organizações do usuário e o contexto (tenant) da rota atual `/o/:slug`. */
@Service()
export class OrgStore {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly memberships = signal<Membership[]>([]);
  readonly currentSlug = signal<string | null>(null);
  /** Saldo disponível (em horas) na organização atual, já descontadas as reservas. */
  readonly balance = signal(0);

  readonly current = computed(
    () => this.memberships().find((m) => m.org.slug === this.currentSlug()) ?? null,
  );
  readonly currentId = computed(() => this.current()?.org.id ?? null);
  readonly isAdmin = computed(() => ['owner', 'admin'].includes(this.current()?.role ?? ''));
  readonly level = computed(() => levelFor(this.current()?.xp ?? 0));

  private loadedFor: string | null = null;

  /** Id da organização atual; falha de forma explícita se a rota não definiu uma. */
  requireId(): string {
    const id = this.currentId();
    if (!id) {
      throw new Error('Nenhuma organização selecionada.');
    }
    return id;
  }

  async ensureLoaded(): Promise<void> {
    const uid = this.auth.user()?.id ?? null;
    if (uid && this.loadedFor !== uid) {
      await this.loadMemberships();
    }
  }

  /** Define a organização atual pelo slug. Retorna false se o usuário não participa dela. */
  async select(slug: string): Promise<boolean> {
    await this.ensureLoaded();
    if (!this.memberships().some((m) => m.org.slug === slug)) {
      return false;
    }
    this.currentSlug.set(slug);
    this.remember(slug);
    await this.refreshBalance();
    return true;
  }

  async refresh(): Promise<void> {
    await this.loadMemberships();
    await this.refreshBalance();
  }

  async homeUrl(): Promise<string> {
    await this.ensureLoaded();
    const list = this.memberships();
    const last = this.lastSlug();
    const target = list.find((m) => m.org.slug === last) ?? (list.length === 1 ? list[0] : null);
    return target ? `/o/${target.org.slug}/inicio` : '/organizacoes';
  }

  /** Link de convite completo, respeitando o endereço-base do app (raiz do domínio ou subcaminho, como no GitHub Pages). */
  inviteUrl(code: string): string {
    const base = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI;
    return new URL(`convite/${code}`, base).href;
  }

  /** Caminho absoluto dentro da organização atual: `link('sessoes', id)` → ['/o', slug, 'sessoes', id]. */
  link(...parts: string[]): string[] {
    return ['/o', this.currentSlug() ?? '', ...parts];
  }

  lastSlug(): string | null {
    try {
      return this.isBrowser ? localStorage.getItem(LAST_ORG_KEY) : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.memberships.set([]);
    this.currentSlug.set(null);
    this.balance.set(0);
    this.loadedFor = null;
  }

  private async loadMemberships(): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid) {
      this.clear();
      return;
    }
    const rows = unwrap(
      await this.client
        .from('memberships')
        .select(
          'role, course_id, xp, hours_given, rating_sum, rating_count, organization:organizations!memberships_org_id_fkey(id, slug, name, description, invite_code, welcome_credits)',
        )
        .eq('user_id', uid)
        .eq('status', 'active')
        .order('joined_at')
        .overrideTypes<MembershipRow[], { merge: false }>(),
    );
    this.memberships.set(
      rows.map(({ organization, ...rest }) => ({ ...rest, org: organization })),
    );
    this.loadedFor = uid;
  }

  private async refreshBalance(): Promise<void> {
    const org = this.currentId();
    const uid = this.auth.user()?.id;
    if (!org || !uid) {
      this.balance.set(0);
      return;
    }
    const { data } = await this.client
      .from('wallet_balances')
      .select('balance')
      .eq('org_id', org)
      .eq('user_id', uid)
      .maybeSingle();
    this.balance.set(Number(data?.balance ?? 0));
  }

  private remember(slug: string): void {
    try {
      if (this.isBrowser) {
        localStorage.setItem(LAST_ORG_KEY, slug);
      }
    } catch {
      // armazenamento indisponível (modo privado etc.): segue sem lembrar
    }
  }
}
