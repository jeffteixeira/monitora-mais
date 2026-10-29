import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClock, lucideMapPin, lucideUsers, lucideVideo } from '@ng-icons/lucide';

import { ZardBadgeComponent } from '@/shared/components/badge';

import type { Session } from '../../core/models';
import { formatDateTime, formatTime, hoursBetween } from '../../core/util/format';
import { levelFor } from '../../core/util/level';
import { Stars } from './stars';
import { OrgStore } from '../../core/org/org.store';

type CardSession = Omit<Session, 'taken'> & { taken?: number };

@Component({
  selector: 'app-session-card',
  imports: [RouterLink, NgIcon, ZardBadgeComponent, Stars],
  viewProviders: [provideIcons({ lucideClock, lucideMapPin, lucideUsers, lucideVideo })],
  template: `
    <article class="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground">
      <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate font-display text-lg leading-tight font-bold">
            {{ session().subject.name }}
          </h2>
          @if (showMonitor()) {
            <a
              [routerLink]="org.link('monitores', session().monitor.id)"
              class="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
            >
              {{ session().monitor.full_name }} · nível {{ monitorLevel() }}
            </a>
          }
        </div>
        <z-badge zType="secondary">{{ hours() }} h</z-badge>
      </header>

      <ul class="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li class="flex items-center gap-2">
          <ng-icon name="lucideClock" size="14" aria-hidden="true" />
          {{ when() }} – {{ until() }}
        </li>
        <li class="flex items-center gap-2">
          <ng-icon [name]="session().mode === 'online' ? 'lucideVideo' : 'lucideMapPin'" size="14" aria-hidden="true" />
          {{ session().mode === 'online' ? 'Online' : 'Presencial' }} · {{ session().location }}
        </li>
        @if (session().taken !== undefined) {
          <li class="flex items-center gap-2">
            <ng-icon name="lucideUsers" size="14" aria-hidden="true" />
            {{ spots() }}
          </li>
        }
      </ul>

      @if (showMonitor() && session().monitor.rating_count > 0) {
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <app-stars [value]="rating()" />
          {{ rating().toString().replace('.', ',') }} ({{ session().monitor.rating_count }})
        </div>
      }

      <footer class="mt-auto flex flex-wrap gap-2 pt-1">
        <ng-content />
      </footer>
    </article>
  `,
})
export class SessionCard {
  readonly session = input.required<CardSession>();
  readonly showMonitor = input(true);
  protected readonly org = inject(OrgStore);

  protected readonly when = computed(() => formatDateTime(this.session().starts_at));
  protected readonly until = computed(() => formatTime(this.session().ends_at));
  protected readonly hours = computed(() =>
    hoursBetween(this.session().starts_at, this.session().ends_at).toString().replace('.', ','),
  );
  protected readonly monitorLevel = computed(() => levelFor(this.session().monitor.xp).level);
  protected readonly rating = computed(() => {
    const m = this.session().monitor;
    return m.rating_count > 0 ? Math.round((m.rating_sum / m.rating_count) * 10) / 10 : 0;
  });
  protected readonly spots = computed(() => {
    const s = this.session();
    const left = s.capacity - (s.taken ?? 0);
    return left <= 0 ? 'Lotada' : left === 1 ? '1 vaga' : `${left} vagas`;
  });
}
