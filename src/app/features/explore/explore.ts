import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

import { CatalogApi } from '../../core/api/catalog.api';
import { SessionsApi } from '../../core/api/sessions.api';
import { SessionCard } from '../../shared/ui/session-card';
import { OrgStore } from '../../core/org/org.store';

const ALL = 'all';

@Component({
  selector: 'app-explore',
  imports: [RouterLink, ZardButtonComponent, ZardEmptyComponent, ZardFieldImports, ZardSelectImports, ZardSkeletonComponent, SessionCard],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Explorar monitorias</h1>
    <p class="mt-1 text-muted-foreground">Escolha a matéria e reserve um horário com um colega.</p>

    <div z-field class="mt-6 max-w-sm">
      <label z-field-label for="subject">Matéria</label>
      <z-select id="subject" zPlaceholder="Todas as matérias" [zValue]="subjectId()" (zSelectionChange)="onSubject($event)">
        <z-select-item [zValue]="all">Todas as matérias</z-select-item>
        @for (s of subjects.value() ?? []; track s.id) {
          <z-select-item [zValue]="s.id">{{ s.name }}</z-select-item>
        }
      </z-select>
    </div>

    <section class="mt-8" aria-live="polite" aria-label="Resultados">
      @if (sessions.isLoading()) {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (i of [1, 2, 3]; track i) {
            <z-skeleton class="h-44 w-full rounded-xl" />
          }
        </div>
      } @else if (sessions.error()) {
        <p role="alert" class="text-destructive">Não foi possível carregar as monitorias.</p>
      } @else if (sessions.value()?.length === 0) {
        <z-empty zTitle="Nenhum horário aberto" zDescription="Ninguém publicou horários para essa matéria ainda. Que tal ser o primeiro monitor?" />
        <div class="mt-4 flex justify-center">
          <a z-button [routerLink]="org.link('monitorar')">Quero monitorar</a>
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (s of sessions.value(); track s.id) {
            <app-session-card [session]="s">
              <a z-button zSize="sm" [routerLink]="org.link('sessoes', s.id)">Ver e reservar</a>
            </app-session-card>
          }
        </div>
      }
    </section>
  `,
})
export class Explore {
  private readonly sessionsApi = inject(SessionsApi);
  protected readonly org = inject(OrgStore);

  protected readonly all = ALL;
  protected readonly subjectId = signal<string>(ALL);
  private readonly catalog = inject(CatalogApi);
  protected readonly subjects = resource({ loader: () => this.catalog.subjects() });
  protected readonly sessions = resource({
    params: () => this.subjectId(),
    loader: ({ params: id }) => this.sessionsApi.listOpen({ subjectId: id === ALL ? undefined : id }),
  });

  protected onSubject(value: string | string[]): void {
    this.subjectId.set(typeof value === 'string' && value ? value : ALL);
  }
}
