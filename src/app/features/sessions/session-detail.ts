import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideCheck, lucideClock, lucideMapPin, lucideVideo } from '@ng-icons/lucide';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogImports } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardInputOtpImports } from '@/shared/components/input-otp';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { ZardSonnerService } from '@/shared/components/sonner';

import { type PresenceRow, CallApi } from '../../core/api/call.api';
import { type SessionAttendee, SessionsApi } from '../../core/api/sessions.api';
import { StudentReviewsApi } from '../../core/api/student-reviews.api';
import { errorMessage } from '../../core/api/unwrap';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import type { BookingStatus, StudentReputation } from '../../core/models';
import { averageRating, formatCredits, formatDateTime, formatTime, hoursBetween } from '../../core/util/format';
import { levelFor } from '../../core/util/level';
import { type ReviewValue, ReviewForm } from '../../shared/ui/review-form';
import { Stars } from '../../shared/ui/stars';

const REVIEW_TAGS = ['Muito paciente', 'Explicação clara', 'Pontual', 'Domina o conteúdo', 'Didática'];
const STUDENT_TAGS = ['Pontual', 'Participativo', 'Preparado', 'Respeitoso', 'Curioso', 'Dedicado'];
const STATUS_LABEL: Record<BookingStatus, string> = {
  booked: 'Reservado',
  checked_in: 'Presente',
  reviewed: 'Avaliou a sessão',
  cancelled: 'Cancelado',
  no_show: 'Ausente',
};

interface Confirm {
  title: string;
  text: string;
  label: string;
  action: () => Promise<void>;
}

@Component({
  selector: 'app-session-detail',
  imports: [
    RouterLink, NgIcon, ReviewForm, Stars, ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardDialogImports,
    ZardFieldImports, ZardInputComponent, ZardInputOtpImports, ZardSkeletonComponent,
  ],
  viewProviders: [provideIcons({ lucideArrowLeft, lucideCheck, lucideClock, lucideMapPin, lucideVideo })],
  template: `
    <a z-button zType="ghost" zSize="sm" [routerLink]="org.link('sessoes')" class="-ml-2 mb-4">
      <ng-icon name="lucideArrowLeft" aria-hidden="true" /> Voltar
    </a>

    @if (data.value(); as d) {
      @let s = d.session;
      <div class="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <z-card>
          <z-card-header>
            <z-card-title [zTitle]="s.subject.name" />
            <ng-template #monitorInfo>
              Com
              <a [routerLink]="org.link('monitores', s.monitor.id)" class="underline underline-offset-4">{{ s.monitor.full_name }}</a>
              · nível {{ monitorLevel() }}
            </ng-template>
            <z-card-description [zDescription]="monitorInfo" />
          </z-card-header>
          <z-card-content class="flex flex-col gap-3">
            <p class="flex items-center gap-2"><ng-icon name="lucideClock" aria-hidden="true" /> {{ formatDateTime(s.starts_at) }} – {{ formatTime(s.ends_at) }} ({{ hours() }})</p>
            <p class="flex items-center gap-2">
              <ng-icon [name]="s.mode === 'online' ? 'lucideVideo' : 'lucideMapPin'" aria-hidden="true" />
              {{ s.mode === 'online' ? 'Online' : 'Presencial' }} · {{ s.location }}
            </p>
            <p><z-badge [zType]="statusType()">{{ sessionStatus() }}</z-badge></p>
          </z-card-content>
        </z-card>

        <z-card>
          <z-card-header><z-card-title [zTitle]="d.isMonitor ? 'Sua monitoria' : 'Sua participação'" /></z-card-header>
          <z-card-content class="flex flex-col gap-4">
            @if (d.isMonitor) {
              @switch (s.status) {
                @case ('open') {
                  <p class="text-sm text-muted-foreground">{{ d.attendees.length }} de {{ s.capacity }} vaga(s) preenchida(s). Você pode iniciar a partir de 15 minutos antes.</p>
                  <button z-button type="button" [zLoading]="busy()" (click)="start()">Iniciar sessão</button>
                  <button z-button zType="destructive" type="button" (click)="askCancelSession()">Cancelar monitoria</button>
                }
                @case ('in_progress') {
                  @if (s.in_app_call) {
                    <a z-button [routerLink]="org.link('sessoes', s.id, 'chamada')">
                      <ng-icon name="lucideVideo" aria-hidden="true" /> Entrar na chamada
                    </a>
                    <details class="text-sm">
                      <summary class="cursor-pointer text-muted-foreground">Check-in por código (alternativa)</summary>
                      <p class="mt-2 font-display text-4xl font-extrabold tracking-[0.25em]" aria-live="polite">{{ d.code ?? '——' }}</p>
                    </details>
                  } @else {
                    <div>
                      <p class="text-sm text-muted-foreground">Passe este código aos alunos para o check-in</p>
                      <p class="mt-1 font-display text-5xl font-extrabold tracking-[0.25em]" aria-live="polite">{{ d.code ?? '——' }}</p>
                    </div>
                  }
                  <button z-button zType="outline" type="button" [zLoading]="busy()" (click)="end()">Encerrar e receber créditos</button>
                }
                @default {
                  <p class="text-sm text-muted-foreground">Sessão encerrada.</p>
                }
              }
            } @else {
              @switch (d.booking?.status ?? 'none') {
                @case ('none') {
                  @if (s.status === 'open') {
                    <p class="text-sm text-muted-foreground">Custo: <strong>{{ hours() }}</strong> · seu saldo: {{ balance() }}</p>
                    <button z-button type="button" [zDisabled]="full()" (click)="bookOpen.set(true)">{{ full() ? 'Lotada' : 'Reservar horário' }}</button>
                  } @else {
                    <p class="text-sm text-muted-foreground">Esta monitoria não está mais aberta.</p>
                  }
                }
                @case ('booked') {
                  @if (s.status === 'in_progress') {
                    @if (s.in_app_call) {
                      <a z-button [routerLink]="org.link('sessoes', s.id, 'chamada')">
                        <ng-icon name="lucideVideo" aria-hidden="true" /> Entrar na chamada
                      </a>
                      <p class="text-sm text-muted-foreground">Sua presença é registrada automaticamente ao entrar.</p>
                      <details class="text-sm">
                        <summary class="cursor-pointer text-muted-foreground">Check-in por código (alternativa)</summary>
                        <div z-field class="mt-3">
                          <label z-field-label for="otp">Código de check-in</label>
                          <z-input-otp-signal id="otp" [zMaxLength]="6" [(value)]="otp" (zComplete)="checkIn()" />
                        </div>
                        <button z-button class="mt-3" type="button" [zLoading]="busy()" [zDisabled]="otp().length < 6" (click)="checkIn()">Confirmar presença</button>
                      </details>
                    } @else {
                      <div z-field>
                        <label z-field-label for="otp">Código de check-in</label>
                        <z-input-otp-signal id="otp" [zMaxLength]="6" [(value)]="otp" (zComplete)="checkIn()" />
                        <p z-field-description>Peça o código de 6 dígitos ao monitor.</p>
                      </div>
                      <button z-button type="button" [zLoading]="busy()" [zDisabled]="otp().length < 6" (click)="checkIn()">Confirmar presença</button>
                    }
                  } @else {
                    <p class="text-sm"><ng-icon name="lucideCheck" aria-hidden="true" /> Reserva confirmada. O check-in abre quando o monitor iniciar.</p>
                    <button z-button zType="outline" type="button" (click)="askCancelBooking()">Cancelar reserva</button>
                  }
                }
                @case ('checked_in') {
                  @if (s.status === 'completed') {
                    <app-review-form
                      question="Como foi a monitoria?"
                      starsLabel="Nota da monitoria"
                      [tags]="reviewTags"
                      [busy]="busy()"
                      (submitted)="sendReview($event)"
                    />
                  } @else {
                    <p class="text-sm">Presença confirmada. Aguarde o monitor encerrar a sessão.</p>
                    @if (s.in_app_call && s.status === 'in_progress') {
                      <a z-button zType="outline" [routerLink]="org.link('sessoes', s.id, 'chamada')">
                        <ng-icon name="lucideVideo" aria-hidden="true" /> Voltar para a chamada
                      </a>
                    }
                  }
                }
                @case ('reviewed') { <p class="text-sm">Obrigado pela avaliação! 🎉</p> }
                @default { <p class="text-sm text-muted-foreground">Status: {{ statusLabel(d.booking?.status) }}</p> }
              }
            }
          </z-card-content>
        </z-card>
      </div>

      @if (d.isMonitor && d.attendees.length) {
        <z-card class="mt-4">
          <z-card-header><z-card-title zTitle="Alunos" /></z-card-header>
          <z-card-content>
            <ul class="divide-y" aria-live="polite">
              @for (a of d.attendees; track a.id) {
                <li class="flex items-center justify-between py-2">
                  <span>
                    {{ a.student.full_name }}
                    @if (d.session.in_app_call && minutesFor(d.presence, a.student.id) > 0) {
                      <span class="ml-2 text-xs text-muted-foreground">{{ minutesFor(d.presence, a.student.id) }} min em chamada</span>
                    }
                  </span>
                  <span class="flex items-center gap-2">
                    @if (reputationOf(d.reputation, a.student.id); as rep) {
                      <span class="flex items-center gap-1 text-xs text-muted-foreground" [attr.title]="'Reputação como aluno: ' + rep.avg + ' (' + rep.count + ' avaliações)'">
                        <app-stars [value]="rep.avg" /> {{ rep.avg }}
                      </span>
                    }
                    <z-badge [zType]="a.status === 'checked_in' || a.status === 'reviewed' ? 'default' : 'secondary'">{{ statusLabel(a.status) }}</z-badge>
                    @if (d.session.status === 'completed' && (a.status === 'checked_in' || a.status === 'reviewed')) {
                      @if (d.given.get(a.id); as given) {
                        <z-badge zType="outline">Avaliado · {{ given }}★</z-badge>
                      } @else {
                        <button z-button zSize="sm" zType="outline" type="button" (click)="studentTarget.set(a)">Avaliar aluno</button>
                      }
                    }
                  </span>
                </li>
              }
            </ul>
          </z-card-content>
        </z-card>
      }
    } @else if (data.error()) {
      <p role="alert" class="text-destructive">Monitoria não encontrada.</p>
    } @else {
      <z-skeleton class="h-48 w-full rounded-xl" />
    }

    <z-dialog [zVisible]="studentTarget() !== null" (zVisibleChange)="!$event && studentTarget.set(null)">
      <z-dialog-header>
        <z-dialog-title [zTitle]="'Avaliar ' + (studentTarget()?.student?.full_name ?? 'aluno')" />
        <z-dialog-description zDescription="O aluno e os administradores da organização verão sua avaliação. Seja objetivo e respeitoso." />
      </z-dialog-header>
      @if (studentTarget()) {
        <app-review-form
          question="Como foi a participação do aluno?"
          starsLabel="Nota do aluno"
          submitLabel="Enviar avaliação do aluno"
          [tags]="studentTags"
          [busy]="busy()"
          (submitted)="sendStudentReview($event)"
        />
      }
    </z-dialog>

    <z-dialog [(zVisible)]="bookOpen">
      <z-dialog-header>
        <z-dialog-title zTitle="Reservar monitoria" />
        <z-dialog-description zDescription="O valor fica reservado na sua carteira e é devolvido se você cancelar com mais de 2 horas de antecedência." />
      </z-dialog-header>
      <div z-field>
        <label z-field-label for="exam">Tem prova chegando? (opcional)</label>
        <input z-input id="exam" type="datetime-local" (input)="examAt.set($any($event.target).value)" />
        <p z-field-description>Monitores ganham a medalha “Salvador de Vidas” ao ajudar em até 48h antes da prova.</p>
      </div>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" (click)="bookOpen.set(false)">Voltar</button>
        <button z-button type="button" [zLoading]="busy()" (click)="book()">Confirmar reserva</button>
      </z-dialog-footer>
    </z-dialog>

    <z-dialog [zVisible]="confirm() !== null" (zVisibleChange)="!$event && confirm.set(null)">
      <z-dialog-header>
        <z-dialog-title [zTitle]="confirm()?.title ?? ''" />
        <z-dialog-description [zDescription]="confirm()?.text ?? ''" />
      </z-dialog-header>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" (click)="confirm.set(null)">Voltar</button>
        <button z-button zType="destructive" type="button" [zLoading]="busy()" (click)="runConfirm()">{{ confirm()?.label }}</button>
      </z-dialog-footer>
    </z-dialog>
  `,
})
export class SessionDetail {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthStore);
  protected readonly org = inject(OrgStore);
  private readonly api = inject(SessionsApi);
  private readonly sonner = inject(ZardSonnerService);
  private readonly callApi = inject(CallApi);
  private readonly studentReviews = inject(StudentReviewsApi);
  private readonly router = inject(Router);

  protected readonly formatDateTime = formatDateTime;
  protected readonly formatTime = formatTime;
  protected readonly reviewTags = REVIEW_TAGS;

  protected readonly busy = signal(false);
  protected readonly bookOpen = signal(false);
  protected readonly confirm = signal<Confirm | null>(null);
  protected readonly examAt = signal('');
  protected readonly otp = signal('');
  protected readonly studentTarget = signal<SessionAttendee | null>(null);
  protected readonly studentTags = STUDENT_TAGS;

  protected readonly data = resource({
    params: () => ({ id: this.id(), uid: this.auth.user()?.id }),
    loader: async ({ params }) => {
      const session = await this.api.get(params.id);
      const isMonitor = session.monitor_id === params.uid;
      const [attendees, code, booking, presence, given] = await Promise.all([
        isMonitor ? this.api.attendees(params.id) : [],
        isMonitor && session.status === 'in_progress' ? this.api.monitorCode(params.id) : null,
        !isMonitor && params.uid ? this.api.myBooking(params.id, params.uid) : null,
        isMonitor && session.in_app_call ? this.callApi.presence(params.id) : [],
        isMonitor && session.status === 'completed'
          ? this.studentReviews.givenForSession(params.id)
          : new Map<string, number>(),
      ]);
      const reputation = isMonitor && attendees.length
        ? await this.studentReviews.reputation(attendees.map((a) => a.student.id))
        : [];
      return { session, isMonitor, attendees, code, booking, presence, given, reputation };
    },
  });

  protected readonly hours = computed(() => {
    const s = this.data.value()?.session;
    return s ? formatCredits(hoursBetween(s.starts_at, s.ends_at)) : '';
  });
  protected readonly balance = computed(() => formatCredits(this.org.balance()));
  protected readonly monitorLevel = computed(() => levelFor(this.data.value()?.session.monitor.xp ?? 0).level);
  protected readonly full = computed(() => {
    const s = this.data.value()?.session;
    return !!s && s.taken >= s.capacity;
  });
  protected readonly sessionStatus = computed(
    () => ({ open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' })[this.data.value()?.session.status ?? 'open'],
  );
  protected readonly statusType = computed(() => (this.data.value()?.session.status === 'in_progress' ? 'default' : 'secondary'));

  constructor() {
    effect((onCleanup) => {
      const stop = this.api.watch(this.id(), () => this.data.reload());
      onCleanup(stop);
    });
  }

  protected minutesFor(presence: PresenceRow[], userId: string): number {
    const ms = presence
      .filter((p) => p.user_id === userId)
      .reduce((sum, p) => sum + (new Date(p.left_at ?? Date.now()).getTime() - new Date(p.joined_at).getTime()), 0);
    return Math.max(0, Math.round(ms / 60_000));
  }

  protected statusLabel(status: BookingStatus | undefined): string {
    return status ? STATUS_LABEL[status] : '';
  }

  protected book(): Promise<void> {
    const exam = this.examAt();
    return this.run(async () => {
      await this.api.book(this.id(), exam ? new Date(exam).toISOString() : null);
      this.bookOpen.set(false);
      this.sonner.success('Reserva confirmada!');
    });
  }

  protected askCancelBooking(): void {
    const bookingId = this.data.value()?.booking?.id;
    if (!bookingId) {
      return;
    }
    this.confirm.set({
      title: 'Cancelar reserva?',
      text: 'Com mais de 2 horas de antecedência o valor volta integralmente para sua carteira. Depois disso, ele não é devolvido.',
      label: 'Cancelar reserva',
      action: async () => this.api.cancelBooking(bookingId),
    });
  }

  protected askCancelSession(): void {
    this.confirm.set({
      title: 'Cancelar monitoria?',
      text: 'Os alunos inscritos serão avisados e os créditos reservados voltam para eles.',
      label: 'Cancelar monitoria',
      action: async () => this.api.cancelSession(this.id()),
    });
  }

  protected runConfirm(): Promise<void> {
    const c = this.confirm();
    return this.run(async () => {
      await c?.action();
      this.confirm.set(null);
    });
  }

  protected start(): Promise<void> {
    return this.run(async () => {
      await this.api.start(this.id());
      const session = this.data.value()?.session;
      if (session?.in_app_call) {
        this.sonner.success('Sessão iniciada. Entrando na chamada…');
        await this.router.navigate(this.org.link('sessoes', this.id(), 'chamada'));
      } else {
        this.sonner.success('Sessão iniciada. Compartilhe o código com os alunos.');
      }
    });
  }

  protected end(): Promise<void> {
    return this.run(async () => {
      const earned = await this.api.end(this.id());
      if (this.data.value()?.session.in_app_call) {
        void this.callApi.closeRoom(this.id());
      }
      this.sonner.success(earned > 0 ? `Sessão encerrada! Você ganhou ${formatCredits(earned)}. Avalie os alunos presentes.` : 'Sessão encerrada sem presenças confirmadas.');
    });
  }

  protected checkIn(): Promise<void> {
    if (this.otp().length < 6 || this.busy()) {
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.api.checkIn(this.id(), this.otp());
      this.otp.set('');
      this.sonner.success('Presença confirmada!');
    });
  }

  protected sendReview(value: ReviewValue): Promise<void> {
    const bookingId = this.data.value()?.booking?.id;
    if (!bookingId) {
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.api.review(bookingId, value.rating, value.tags, value.comment);
      this.sonner.success('Avaliação enviada. Obrigado!');
    });
  }

  protected sendStudentReview(value: ReviewValue): Promise<void> {
    const target = this.studentTarget();
    if (!target) {
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.studentReviews.submit(target.id, value.rating, value.tags, value.comment);
      this.studentTarget.set(null);
      this.sonner.success(`Avaliação de ${target.student.full_name} enviada.`);
    });
  }

  protected reputationOf(
    list: StudentReputation[],
    userId: string,
  ): { avg: number; count: number } | null {
    const r = list.find((x) => x.user_id === userId);
    const avg = r ? averageRating(r.rating_sum, r.rating_count) : null;
    return r && avg !== null ? { avg, count: r.rating_count } : null;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      await Promise.all([this.org.refresh(), this.data.reload()]);
    } catch (err) {
      this.sonner.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
