import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardTabsImports } from '@/shared/components/tabs';

import { SessionsApi } from '../../core/api/sessions.api';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import { SessionCard } from '../../shared/ui/session-card';

const BOOKING_LABEL = {
  booked: 'Reservada',
  checked_in: 'Presente',
  reviewed: 'Avaliada',
  no_show: 'Ausente',
  cancelled: 'Cancelada',
} as const;

@Component({
  selector: 'app-sessions',
  imports: [RouterLink, SessionCard, ZardBadgeComponent, ZardButtonComponent, ZardEmptyComponent, ZardSkeletonComponent, ZardTabsImports],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Minhas sessões</h1>
    <p class="mt-1 mb-6 text-muted-foreground">Acompanhe o que você reservou e o que você ministra.</p>

    <z-tab-group>
      <z-tab label="Como aluno">
        <div class="pt-6">
          @if (bookings.isLoading()) {
            <z-skeleton class="h-44 w-full rounded-xl" />
          } @else if (bookings.value()?.length === 0) {
            <z-empty zTitle="Nenhuma reserva ainda" zDescription="Encontre um monitor e reserve seu primeiro horário." />
            <div class="mt-4 flex justify-center"><a z-button [routerLink]="org.link('explorar')">Explorar monitorias</a></div>
          } @else {
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (b of bookings.value(); track b.id) {
                <app-session-card [session]="b.session">
                  <z-badge zType="outline">{{ bookingLabel[b.status] }}</z-badge>
                  <a z-button zSize="sm" zType="outline" [routerLink]="org.link('sessoes', b.session_id)">Abrir</a>
                </app-session-card>
              }
            </div>
          }
        </div>
      </z-tab>

      <z-tab label="Como monitor">
        <div class="pt-6">
          @if (teaching.isLoading()) {
            <z-skeleton class="h-44 w-full rounded-xl" />
          } @else if (teaching.value()?.length === 0) {
            <z-empty zTitle="Você ainda não publicou horários" zDescription="Escolha suas matérias e publique horários livres para começar a ganhar créditos." />
            <div class="mt-4 flex justify-center"><a z-button [routerLink]="org.link('monitorar')">Publicar horários</a></div>
          } @else {
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (s of teaching.value(); track s.id) {
                <app-session-card [session]="s" [showMonitor]="false">
                  <z-badge zType="outline">{{ sessionLabel[s.status] }}</z-badge>
                  <a z-button zSize="sm" zType="outline" [routerLink]="org.link('sessoes', s.id)">Gerenciar</a>
                </app-session-card>
              }
            </div>
          }
        </div>
      </z-tab>
    </z-tab-group>
  `,
})
export class Sessions {
  private readonly auth = inject(AuthStore);
  protected readonly org = inject(OrgStore);
  private readonly api = inject(SessionsApi);

  protected readonly bookingLabel = BOOKING_LABEL;
  protected readonly sessionLabel = { open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' } as const;

  private readonly uid = computed(() => this.auth.user()?.id);
  protected readonly bookings = resource({
    params: () => this.uid(),
    loader: ({ params }) => this.api.myBookings(params),
  });
  protected readonly teaching = resource({
    params: () => this.uid(),
    loader: ({ params }) => this.api.teaching(params),
  });
}
