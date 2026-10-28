import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAward } from '@ng-icons/lucide';

import { ZardAvatarImports } from '@/shared/components/avatar';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

import { CatalogApi } from '../../core/api/catalog.api';
import { GamificationApi } from '../../core/api/gamification.api';
import { SessionsApi } from '../../core/api/sessions.api';
import { OrgApi } from '../../core/api/org.api';
import { averageRating } from '../../core/util/format';
import { levelFor } from '../../core/util/level';
import { SessionCard } from '../../shared/ui/session-card';
import { Stars } from '../../shared/ui/stars';
import { OrgStore } from '../../core/org/org.store';

@Component({
  selector: 'app-monitor-profile',
  imports: [DatePipe, RouterLink, NgIcon, Stars, SessionCard, ZardAvatarImports, ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardEmptyComponent, ZardSkeletonComponent],
  viewProviders: [provideIcons({ lucideAward })],
  template: `
    @if (profile.value(); as p) {
      <header class="flex flex-wrap items-center gap-4">
        <z-avatar [zFallback]="initials()" zSize="lg" />
        <div>
          <h1 class="font-display text-3xl font-extrabold">{{ p.full_name }}</h1>
          <p class="text-muted-foreground">Nível {{ level().level }} · {{ level().title }}</p>
          <div class="mt-1 flex items-center gap-2 text-sm">
            <app-stars [value]="rating() ?? 0" />
            @if (rating() !== null) { {{ rating() }} ({{ p.rating_count }} avaliações) } @else { Ainda sem avaliações }
          </div>
        </div>
      </header>
      @if (p.bio) { <p class="mt-4 max-w-2xl">{{ p.bio }}</p> }

      <section class="mt-6 flex flex-wrap gap-2" aria-label="Matérias e medalhas">
        @for (s of subjectNames(); track s) { <z-badge zType="secondary">{{ s }}</z-badge> }
        @for (b of badges(); track b.code) {
          <z-badge class="bg-gold-soft text-foreground"><ng-icon name="lucideAward" aria-hidden="true" />{{ b.name }}</z-badge>
        }
      </section>

      <h2 class="mt-10 font-display text-2xl font-bold">Horários abertos</h2>
      <div class="mt-4">
        @if (sessions.value()?.length) {
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (s of sessions.value(); track s.id) {
              <app-session-card [session]="s" [showMonitor]="false">
                <a z-button zSize="sm" [routerLink]="org.link('sessoes', s.id)">Ver e reservar</a>
              </app-session-card>
            }
          </div>
        } @else {
          <z-empty zTitle="Sem horários abertos" zDescription="Volte mais tarde — este monitor ainda não publicou novos horários." />
        }
      </div>

      <h2 class="mt-10 font-display text-2xl font-bold">O que dizem os alunos</h2>
      <ul class="mt-4 grid gap-3 md:grid-cols-2">
        @for (r of reviews.value() ?? []; track r.id) {
          <li class="rounded-xl border p-4">
            <div class="flex items-center justify-between"><app-stars [value]="r.rating" /><time class="text-xs text-muted-foreground" [attr.datetime]="r.created_at">{{ r.created_at | date: 'dd/MM/yyyy' }}</time></div>
            @if (r.tags.length) { <p class="mt-2 flex flex-wrap gap-1.5">@for (t of r.tags; track t) { <z-badge zType="outline">{{ t }}</z-badge> }</p> }
            @if (r.comment) { <p class="mt-2 text-sm">{{ r.comment }}</p> }
          </li>
        }
      </ul>
    } @else if (profile.error()) {
      <p role="alert" class="text-destructive">Monitor não encontrado.</p>
    } @else {
      <z-skeleton class="h-32 w-full rounded-xl" />
    }
  `,
})
export class MonitorProfile {
  readonly id = input.required<string>();
  protected readonly org = inject(OrgStore);

  private readonly orgApi = inject(OrgApi);
  private readonly catalog = inject(CatalogApi);
  private readonly sessionsApi = inject(SessionsApi);
  private readonly gamification = inject(GamificationApi);

  protected readonly profile = resource({
    params: () => this.id(),
    loader: ({ params }) => this.orgApi.member(params),
  });
  protected readonly sessions = resource({
    params: () => this.id(),
    loader: ({ params }) => this.sessionsApi.listOpen({ monitorId: params }),
  });
  protected readonly reviews = resource({
    params: () => this.id(),
    loader: ({ params }) => this.gamification.reviews(params),
  });
  private readonly subjectIds = resource({
    params: () => this.id(),
    loader: ({ params }) => this.catalog.monitorSubjectIds(params),
  });
  private readonly allSubjects = resource({ loader: () => this.catalog.subjects() });
  private readonly allBadges = resource({ loader: () => this.gamification.badges() });
  private readonly earned = resource({
    params: () => this.id(),
    loader: ({ params }) => this.gamification.earnedBadgeCodes(params),
  });

  protected readonly level = computed(() => levelFor(this.profile.value()?.xp ?? 0));
  protected readonly rating = computed(() => {
    const p = this.profile.value();
    return p ? averageRating(p.rating_sum, p.rating_count) : null;
  });
  protected readonly initials = computed(() =>
    (this.profile.value()?.full_name ?? '?').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join(''),
  );
  protected readonly subjectNames = computed(() => {
    const ids = new Set(this.subjectIds.value() ?? []);
    return (this.allSubjects.value() ?? []).filter((s) => ids.has(s.id)).map((s) => s.name);
  });
  protected readonly badges = computed(() => {
    const codes = new Set(this.earned.value() ?? []);
    return (this.allBadges.value() ?? []).filter((b) => codes.has(b.code));
  });
}
