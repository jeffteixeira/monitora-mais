import { Component, computed, inject, resource, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';

import { CatalogApi } from '../../core/api/catalog.api';
import { SessionsApi } from '../../core/api/sessions.api';
import { errorMessage } from '../../core/api/unwrap';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import type { SessionMode } from '../../core/models';

const pick = (v: string | string[]): string => (typeof v === 'string' ? v : '');

@Component({
  selector: 'app-teach',
  imports: [NgIcon, ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardFieldImports, ZardInputComponent, ZardSelectImports],
  viewProviders: [provideIcons({ lucideX })],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Monitorar</h1>
    <p class="mt-1 text-muted-foreground">Cada hora ensinada vira 1 crédito de tempo na sua carteira.</p>

    <div class="mt-6 grid gap-4 lg:grid-cols-2">
      <z-card>
        <z-card-header>
          <z-card-title zTitle="Matérias que você domina" />
          <z-card-description zDescription="Alunos encontram você por estas matérias." />
        </z-card-header>
        <z-card-content class="flex flex-col gap-4">
          <ul class="flex flex-wrap gap-2" aria-label="Suas matérias">
            @for (s of mine(); track s.id) {
              <li>
                <z-badge zType="secondary" class="gap-1 pr-1">
                  {{ s.name }}
                  <button type="button" class="rounded-full p-0.5 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" [attr.aria-label]="'Remover ' + s.name" (click)="removeSubject(s.id)">
                    <ng-icon name="lucideX" size="12" aria-hidden="true" />
                  </button>
                </z-badge>
              </li>
            } @empty {
              <li class="text-sm text-muted-foreground">Nenhuma matéria adicionada ainda.</li>
            }
          </ul>
          <div z-field>
            <label z-field-label for="add-subject">Adicionar matéria</label>
            <z-select id="add-subject" zPlaceholder="Escolha uma matéria" [(zValue)]="addValue" (zSelectionChange)="addSubject($event)">
              @for (s of available(); track s.id) { <z-select-item [zValue]="s.id">{{ s.name }}</z-select-item> }
            </z-select>
          </div>
        </z-card-content>
      </z-card>

      <z-card>
        <z-card-header>
          <z-card-title zTitle="Publicar horário" />
          <z-card-description [zDescription]="level() >= 5 ? 'Nível 5+: você pode atender grupos.' : 'Grupos maiores liberam no nível 5 (Tutor Experiente).'" />
        </z-card-header>
        <z-card-content>
          <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); publish()">
            <z-field-group>
              <div z-field>
                <label z-field-label for="subject">Matéria</label>
                <z-select id="subject" zPlaceholder="Escolha uma matéria" [(zValue)]="subjectId">
                  @for (s of mine(); track s.id) { <z-select-item [zValue]="s.id">{{ s.name }}</z-select-item> }
                </z-select>
              </div>
              <div z-field>
                <label z-field-label for="starts">Início</label>
                <input z-input id="starts" type="datetime-local" required (input)="startsAt.set($any($event.target).value)" />
              </div>
              <div z-field>
                <label z-field-label for="duration">Duração</label>
                <z-select id="duration" [(zValue)]="duration">
                  <z-select-item zValue="30">30 min</z-select-item>
                  <z-select-item zValue="60">1 hora</z-select-item>
                  <z-select-item zValue="90">1h30</z-select-item>
                  <z-select-item zValue="120">2 horas</z-select-item>
                </z-select>
              </div>
              <div z-field>
                <label z-field-label for="mode">Formato</label>
                <z-select id="mode" [(zValue)]="mode">
                  <z-select-item zValue="presencial">Presencial</z-select-item>
                  <z-select-item zValue="online">Online</z-select-item>
                </z-select>
              </div>
              @if (mode() === 'online') {
                <div z-field>
                  <label z-field-label for="call-type">Como será a chamada?</label>
                  <z-select id="call-type" [(zValue)]="callType">
                    <z-select-item zValue="integrada">Videochamada no Monitora+ (recomendado)</z-select-item>
                    <z-select-item zValue="externa">Link externo (Meet, Zoom…)</z-select-item>
                  </z-select>
                  @if (inApp()) {
                    <p z-field-description>A sala é criada automaticamente, com chat, quadro branco e presença registrada.</p>
                  }
                </div>
              }
              @if (!inApp()) {
                <div z-field>
                  <label z-field-label for="location">{{ mode() === 'online' ? 'Link da chamada' : 'Local' }}</label>
                  <input z-input id="location" required minlength="2" maxlength="200" (input)="location.set($any($event.target).value)" />
                </div>
              }
              @if (level() >= 5) {
                <div z-field>
                  <label z-field-label for="capacity">Vagas</label>
                  <input z-input id="capacity" type="number" min="1" max="10" [value]="capacity()" (input)="capacity.set(+$any($event.target).value)" />
                </div>
              }
            </z-field-group>
            <button z-button type="submit" [zLoading]="busy()" [zDisabled]="!canPublish()">Publicar horário</button>
          </form>
        </z-card-content>
      </z-card>
    </div>
  `,
})
export class Teach {
  private readonly auth = inject(AuthStore);
  protected readonly org = inject(OrgStore);
  private readonly catalog = inject(CatalogApi);
  private readonly api = inject(SessionsApi);
  private readonly sonner = inject(ZardSonnerService);

  protected readonly level = computed(() => this.org.level().level);
  protected readonly busy = signal(false);

  protected readonly addValue = signal<string | string[]>('');
  protected readonly subjectId = signal<string | string[]>('');
  protected readonly startsAt = signal('');
  protected readonly duration = signal<string | string[]>('60');
  protected readonly mode = signal<string | string[]>('presencial');
  protected readonly location = signal('');
  protected readonly callType = signal<string | string[]>('integrada');
  protected readonly capacity = signal(1);

  private readonly allSubjects = resource({ loader: () => this.catalog.subjects() });
  private readonly mineIds = resource({
    params: () => this.auth.user()?.id,
    loader: ({ params }) => this.catalog.monitorSubjectIds(params),
  });

  protected readonly mine = computed(() => {
    const ids = new Set(this.mineIds.value() ?? []);
    return (this.allSubjects.value() ?? []).filter((s) => ids.has(s.id));
  });
  protected readonly available = computed(() => {
    const ids = new Set(this.mineIds.value() ?? []);
    return (this.allSubjects.value() ?? []).filter((s) => !ids.has(s.id));
  });
  protected readonly inApp = computed(
    () => pick(this.mode()) === 'online' && pick(this.callType()) === 'integrada',
  );
  protected readonly canPublish = computed(
    () =>
      pick(this.subjectId()) !== '' &&
      this.startsAt() !== '' &&
      (this.inApp() || this.location().trim().length >= 2),
  );

  protected async addSubject(value: string | string[]): Promise<void> {
    const uid = this.auth.user()?.id;
    const id = pick(value);
    if (!uid || !id) {
      return;
    }
    await this.guard(async () => {
      await this.catalog.addMonitorSubject(uid, id);
      this.mineIds.reload();
    });
    // a matéria sai da lista de disponíveis: limpa o select para não exibir o id
    this.addValue.set('');
  }

  protected async removeSubject(id: string): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid) {
      return;
    }
    await this.guard(async () => {
      await this.catalog.removeMonitorSubject(uid, id);
      this.mineIds.reload();
    });
  }

  protected async publish(): Promise<void> {
    const start = new Date(this.startsAt());
    const end = new Date(start.getTime() + Number(pick(this.duration())) * 60_000);
    this.busy.set(true);
    await this.guard(async () => {
      await this.api.publish({
        subjectId: pick(this.subjectId()),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        mode: pick(this.mode()) as SessionMode,
        location: this.inApp() ? 'Videochamada no Monitora+' : this.location().trim(),
        inApp: this.inApp(),
        capacity: this.level() >= 5 ? this.capacity() : 1,
      });
      this.sonner.success('Horário publicado! Os alunos já podem reservar.');
    });
    this.busy.set(false);
  }

  private async guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      this.sonner.error(errorMessage(err));
    }
  }
}
