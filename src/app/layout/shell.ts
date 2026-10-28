import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendarCheck,
  lucideGraduationCap,
  lucideHouse,
  lucideLogOut,
  lucideSearch,
  lucideShieldCheck,
  lucideTrophy,
  lucideWallet,
} from '@ng-icons/lucide';

import { ZardAvatarImports } from '@/shared/components/avatar';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardSelectImports } from '@/shared/components/select';

import { AuthStore } from '../core/auth/auth.store';
import { OrgStore } from '../core/org/org.store';
import { PwaService } from '../core/pwa/pwa.service';
import { formatCredits } from '../core/util/format';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { path: 'inicio', label: 'Início', icon: 'lucideHouse' },
  { path: 'explorar', label: 'Explorar', icon: 'lucideSearch' },
  { path: 'sessoes', label: 'Sessões', icon: 'lucideCalendarCheck' },
  { path: 'monitorar', label: 'Monitorar', icon: 'lucideGraduationCap' },
  { path: 'carteira', label: 'Carteira', icon: 'lucideWallet' },
  { path: 'ranking', label: 'Ranking', icon: 'lucideTrophy' },
];
const ADMIN: NavItem = { path: 'admin', label: 'Admin', icon: 'lucideShieldCheck' };
const MANAGE = '__manage__';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon, ZardButtonComponent, ZardAvatarImports, ZardSelectImports],
  viewProviders: [
    provideIcons({
      lucideHouse,
      lucideSearch,
      lucideCalendarCheck,
      lucideGraduationCap,
      lucideWallet,
      lucideTrophy,
      lucideShieldCheck,
      lucideLogOut,
    }),
  ],
  template: `
    <a
      href="#conteudo"
      class="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      Pular para o conteúdo
    </a>

    <header class="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 2xl:max-w-[88rem]">
        <a [routerLink]="base() + 'inicio'" class="font-display text-lg font-extrabold tracking-tight">
          Monitora<span class="text-gold">+</span>
        </a>

        <div class="w-32 shrink-0 min-[420px]:w-40 sm:w-52">
          <z-select
            aria-label="Organização"
            [zValue]="org.currentSlug() ?? ''"
            (zSelectionChange)="switchOrg($event)"
          >
            @for (m of org.memberships(); track m.org.id) {
              <z-select-item [zValue]="m.org.slug">{{ m.org.name }}</z-select-item>
            }
            <z-select-item [zValue]="manage">Minhas organizações…</z-select-item>
          </z-select>
        </div>

        <nav aria-label="Principal" class="ml-1 hidden min-w-0 items-center gap-1 lg:flex">
          @for (item of nav(); track item.path) {
            <a
              [routerLink]="base() + item.path"
              routerLinkActive="bg-accent text-accent-foreground"
              ariaCurrentWhenActive="page"
              [attr.aria-label]="item.label"
              [title]="item.label"
              class="flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ng-icon [name]="item.icon" size="16" aria-hidden="true" />
              <span class="hidden 2xl:inline">{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="ml-auto flex items-center gap-2">
          @if (pwa.canInstall()) {
            <button z-button zType="outline" zSize="sm" type="button" class="hidden sm:inline-flex" (click)="pwa.install()">
              Instalar app
            </button>
          }
          <a
            [routerLink]="base() + 'carteira'"
            class="flex shrink-0 items-center gap-1.5 rounded-full border bg-gold-soft px-3 py-1 text-sm font-semibold whitespace-nowrap text-foreground"
            aria-label="Seu saldo de créditos nesta organização"
          >
            <ng-icon name="lucideWallet" size="14" aria-hidden="true" />
            <span aria-live="polite">{{ balanceLabel() }}</span>
          </a>
          <a [routerLink]="base() + 'perfil'" aria-label="Meu perfil" class="rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <z-avatar [zFallback]="initials()" zSize="sm" />
          </a>
          <button z-button zType="ghost" zSize="icon" type="button" class="hidden sm:inline-flex" aria-label="Sair" (click)="signOut()">
            <ng-icon name="lucideLogOut" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    <main id="conteudo" class="mx-auto max-w-6xl px-4 py-6 pb-28 lg:pb-10">
      <router-outlet />
    </main>

    <nav
      aria-label="Principal"
      class="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      @for (item of nav(); track item.path) {
        <a
          [routerLink]="base() + item.path"
          routerLinkActive="text-primary"
          ariaCurrentWhenActive="page"
          class="flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[0.68rem] font-medium text-muted-foreground focus-visible:bg-accent focus-visible:outline-none"
        >
          <ng-icon [name]="item.icon" size="20" aria-hidden="true" />
          {{ item.label }}
        </a>
      }
    </nav>
  `,
})
export class Shell {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly org = inject(OrgStore);
  protected readonly pwa = inject(PwaService);

  protected readonly manage = MANAGE;
  protected readonly base = computed(() => `/o/${this.org.currentSlug()}/`);
  protected readonly nav = computed(() => (this.org.isAdmin() ? [...NAV, ADMIN] : NAV));
  protected readonly balanceLabel = computed(() => formatCredits(this.org.balance()));
  protected readonly initials = computed(() =>
    (this.auth.profile()?.full_name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join(''),
  );

  protected switchOrg(value: string | string[]): void {
    const slug = typeof value === 'string' ? value : '';
    if (slug === MANAGE) {
      void this.router.navigateByUrl('/organizacoes');
    } else if (slug && slug !== this.org.currentSlug()) {
      void this.router.navigateByUrl(`/o/${slug}/inicio`);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.org.clear();
    await this.router.navigateByUrl('/');
  }
}
