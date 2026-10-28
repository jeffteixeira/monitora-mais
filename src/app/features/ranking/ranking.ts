import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardTableImports } from '@/shared/components/table';

import { CatalogApi } from '../../core/api/catalog.api';
import { type LeaderboardMetric, type LeaderboardScope, GamificationApi } from '../../core/api/gamification.api';
import { Stars } from '../../shared/ui/stars';
import { OrgStore } from '../../core/org/org.store';

const str = (v: string | string[]): string => (typeof v === 'string' ? v : '');

@Component({
  selector: 'app-ranking',
  imports: [RouterLink, Stars, ZardEmptyComponent, ZardFieldImports, ZardSelectImports, ZardSkeletonComponent, ZardTableImports],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Ranking</h1>
    <p class="mt-1 text-muted-foreground">Competição saudável: quem mais ajudou os colegas.</p>

    <div class="mt-6 grid gap-4 sm:grid-cols-3">
      <div z-field>
        <label z-field-label for="metric">Métrica</label>
        <z-select id="metric" [(zValue)]="metric">
          <z-select-item zValue="hours_month">Horas doadas no mês</z-select-item>
          <z-select-item zValue="rating">Melhor avaliados</z-select-item>
        </z-select>
      </div>
      <div z-field>
        <label z-field-label for="scope">Escopo</label>
        <z-select id="scope" [(zValue)]="scope" (zSelectionChange)="scopeId.set('')">
          <z-select-item zValue="campus">Todo o campus</z-select-item>
          <z-select-item zValue="department">Departamento</z-select-item>
          <z-select-item zValue="course">Curso</z-select-item>
        </z-select>
      </div>
      @if (scope() !== 'campus') {
        <div z-field>
          <label z-field-label for="scope-id">{{ scope() === 'course' ? 'Curso' : 'Departamento' }}</label>
          <z-select id="scope-id" zPlaceholder="Selecione" [(zValue)]="scopeId">
            @for (o of options(); track o.id) { <z-select-item [zValue]="o.id">{{ o.name }}</z-select-item> }
          </z-select>
        </div>
      }
    </div>

    <section class="mt-8" aria-live="polite">
      @if (board.isLoading()) {
        <z-skeleton class="h-48 w-full rounded-xl" />
      } @else if (board.value()?.length) {
        <ol class="mb-8 grid gap-3 sm:grid-cols-3">
          @for (e of podium(); track e.user_id; let i = $index) {
            <li class="rounded-2xl border p-5" [class]="i === 0 ? 'bg-gold-soft' : ''">
              <p class="font-display text-3xl font-extrabold">{{ i + 1 }}º</p>
              <a [routerLink]="org.link('monitores', e.user_id)" class="mt-1 block truncate font-semibold underline-offset-4 hover:underline">{{ e.full_name }}</a>
              <p class="text-sm text-muted-foreground">{{ metric() === 'rating' ? (e.avg_rating ?? 0) + ' ★' : e.hours + ' h' }} · nível {{ e.level }}</p>
            </li>
          }
        </ol>
        <table z-table>
          <caption class="sr-only">Classificação de monitores</caption>
          <thead z-table-header>
            <tr z-table-row><th z-table-head>#</th><th z-table-head>Monitor</th><th z-table-head>Curso</th><th z-table-head>Nível</th><th z-table-head>Horas no mês</th><th z-table-head>Avaliação</th></tr>
          </thead>
          <tbody z-table-body>
            @for (e of board.value(); track e.user_id; let i = $index) {
              <tr z-table-row>
                <td z-table-cell>{{ i + 1 }}</td>
                <td z-table-cell><a [routerLink]="org.link('monitores', e.user_id)" class="underline-offset-4 hover:underline">{{ e.full_name }}</a></td>
                <td z-table-cell>{{ e.course_name ?? '—' }}</td>
                <td z-table-cell>{{ e.level }}</td>
                <td z-table-cell>{{ e.hours }} h</td>
                <td z-table-cell>@if (e.avg_rating !== null) { <app-stars [value]="e.avg_rating" /> } @else { — }</td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <z-empty zTitle="Ainda sem classificados" zDescription="Conclua monitorias neste mês para aparecer no ranking." />
      }
    </section>
  `,
})
export class Ranking {
  private readonly gamification = inject(GamificationApi);
  protected readonly org = inject(OrgStore);
  private readonly catalog = inject(CatalogApi);

  protected readonly metric = signal<string | string[]>('hours_month');
  protected readonly scope = signal<string | string[]>('campus');
  protected readonly scopeId = signal<string | string[]>('');

  private readonly courses = resource({ loader: () => this.catalog.courses() });
  private readonly departments = resource({ loader: () => this.catalog.departments() });

  protected readonly options = computed(() =>
    (str(this.scope()) === 'course' ? this.courses.value() : this.departments.value()) ?? [],
  );

  protected readonly board = resource({
    params: () => ({ metric: str(this.metric()), scope: str(this.scope()), scopeId: str(this.scopeId()) }),
    loader: async ({ params }) => {
      if (params.scope !== 'campus' && !params.scopeId) {
        return [];
      }
      return this.gamification.leaderboard(
        params.metric as LeaderboardMetric,
        params.scope as LeaderboardScope,
        params.scope === 'campus' ? null : params.scopeId,
      );
    },
  });

  protected readonly podium = computed(() => (this.board.value() ?? []).slice(0, 3));
}
