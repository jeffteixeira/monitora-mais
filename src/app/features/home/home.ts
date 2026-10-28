import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAward, lucideSearch } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

import { GamificationApi } from '../../core/api/gamification.api';
import { StudentReviewsApi } from '../../core/api/student-reviews.api';
import { SessionsApi } from '../../core/api/sessions.api';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import { formatCredits, formatDateTime } from '../../core/util/format';
import { LevelCard } from '../../shared/ui/level-card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, NgIcon, ZardButtonComponent, ZardCardImports, ZardEmptyComponent, ZardSkeletonComponent, LevelCard],
  viewProviders: [provideIcons({ lucideAward, lucideSearch })],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Olá, {{ firstName() }} 👋</h1>
    <p class="mt-1 text-muted-foreground">Veja seu tempo, seu progresso e o que vem por aí.</p>

    <div class="mt-6 grid gap-4 lg:grid-cols-3">
      <z-card class="lg:col-span-2">
        <z-card-header><z-card-title zTitle="Seu nível" /></z-card-header>
        <z-card-content><app-level-card [xp]="org.current()?.xp ?? 0" /></z-card-content>
      </z-card>

      <z-card>
        <z-card-header><z-card-title zTitle="Saldo de tempo" /></z-card-header>
        <z-card-content>
          <p class="font-display text-4xl font-extrabold" aria-live="polite">{{ balance() }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ hoursGiven() }} dadas no total</p>
          <a z-button zType="outline" zSize="sm" class="mt-4" [routerLink]="org.link('carteira')">Ver carteira</a>
        </z-card-content>
      </z-card>
    </div>

    @if (pendingReviews.value()?.length) {
      <z-card class="mt-4">
        <z-card-header>
          <z-card-title zTitle="Alunos para avaliar" />
          <z-card-description zDescription="Avalie a participação de quem esteve presente nas suas monitorias (prazo de 14 dias)." />
        </z-card-header>
        <z-card-content>
          <ul class="flex flex-col divide-y">
            @for (p of pendingReviews.value(); track p.booking_id) {
              <li class="flex items-center justify-between gap-3 py-2">
                <span class="min-w-0 truncate">{{ p.student_name }} <span class="text-sm text-muted-foreground">· {{ p.subject_name }}</span></span>
                <a z-button zType="outline" zSize="sm" [routerLink]="org.link('sessoes', p.session_id)">Avaliar</a>
              </li>
            }
          </ul>
        </z-card-content>
      </z-card>
    }

    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      <z-card class="lg:col-span-2">
        <z-card-header><z-card-title zTitle="Próximas sessões" /></z-card-header>
        <z-card-content>
          @if (upcoming.isLoading()) {
            <z-skeleton class="h-16 w-full" />
          } @else if (upcomingItems().length === 0) {
            <z-empty zTitle="Nenhuma sessão agendada" zDescription="Encontre um monitor para a matéria que está te tirando o sono.">
            </z-empty>
            <div class="mt-4 flex justify-center">
              <a z-button [routerLink]="org.link('explorar')"><ng-icon name="lucideSearch" aria-hidden="true" /> Explorar monitorias</a>
            </div>
          } @else {
            <ul class="flex flex-col divide-y">
              @for (item of upcomingItems(); track item.id) {
                <li class="flex items-center justify-between gap-3 py-3">
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ item.title }}</p>
                    <p class="text-sm text-muted-foreground">{{ item.when }} · {{ item.role }}</p>
                  </div>
                  <a z-button zType="outline" zSize="sm" [routerLink]="org.link('sessoes', item.sessionId)">Abrir</a>
                </li>
              }
            </ul>
          }
        </z-card-content>
      </z-card>

      <z-card>
        <z-card-header><z-card-title zTitle="Medalhas" /></z-card-header>
        <z-card-content>
          @if (earned.value()?.length) {
            <ul class="flex flex-wrap gap-2">
              @for (b of earnedBadges(); track b.code) {
                <li class="flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-sm font-medium">
                  <ng-icon name="lucideAward" size="14" aria-hidden="true" />{{ b.name }}
                </li>
              }
            </ul>
          } @else {
            <p class="text-sm text-muted-foreground">Dê sua primeira monitoria para conquistar medalhas.</p>
          }
          <a z-button zType="link" zSize="sm" class="mt-3 px-0" [routerLink]="org.link('perfil')">Ver todas</a>
        </z-card-content>
      </z-card>
    </div>
  `,
})
export class Home {
  protected readonly auth = inject(AuthStore);
  protected readonly org = inject(OrgStore);
  private readonly sessionsApi = inject(SessionsApi);
  private readonly gamification = inject(GamificationApi);
  private readonly studentReviews = inject(StudentReviewsApi);
  protected readonly pendingReviews = resource({ loader: () => this.studentReviews.pending() });

  protected readonly firstName = computed(() => this.auth.profile()?.full_name.split(' ')[0] ?? '');
  protected readonly balance = computed(() => formatCredits(this.org.balance()));
  protected readonly hoursGiven = computed(() => formatCredits(Number(this.org.current()?.hours_given ?? 0)));

  protected readonly upcoming = resource({
    params: () => this.auth.user()?.id,
    loader: async ({ params: uid }) => {
      const [bookings, teaching] = await Promise.all([
        this.sessionsApi.myBookings(uid),
        this.sessionsApi.teaching(uid),
      ]);
      const now = Date.now();
      return [
        ...bookings
          .filter((b) => ['booked', 'checked_in'].includes(b.status) && ['open', 'in_progress'].includes(b.session.status))
          .map((b) => ({ id: b.id, sessionId: b.session_id, title: b.session.subject.name, at: b.session.starts_at, role: 'como aluno' })),
        ...teaching
          .filter((s) => ['open', 'in_progress'].includes(s.status) && new Date(s.ends_at).getTime() > now)
          .map((s) => ({ id: s.id, sessionId: s.id, title: s.subject.name, at: s.starts_at, role: 'como monitor' })),
      ].sort((a, b) => a.at.localeCompare(b.at));
    },
  });

  protected readonly upcomingItems = computed(() =>
    (this.upcoming.value() ?? []).slice(0, 5).map((i) => ({ ...i, when: formatDateTime(i.at) })),
  );

  private readonly allBadges = resource({ loader: () => this.gamification.badges() });
  protected readonly earned = resource({
    params: () => this.auth.user()?.id,
    loader: ({ params: uid }) => this.gamification.earnedBadgeCodes(uid),
  });
  protected readonly earnedBadges = computed(() => {
    const codes = new Set(this.earned.value() ?? []);
    return (this.allBadges.value() ?? []).filter((b) => codes.has(b.code));
  });
}
