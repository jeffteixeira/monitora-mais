import { Component, ElementRef, computed, effect, inject, input, resource, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideMessageSquare,
  lucideMic,
  lucideMicOff,
  lucideMonitorUp,
  lucidePenLine,
  lucidePhoneOff,
  lucideSend,
  lucideVideo,
  lucideVideoOff,
} from '@ng-icons/lucide';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogImports } from '@/shared/components/dialog';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';

import { CallApi } from '../../../core/api/call.api';
import { SessionsApi } from '../../../core/api/sessions.api';
import { errorMessage } from '../../../core/api/unwrap';
import { AuthStore } from '../../../core/auth/auth.store';
import { OrgStore } from '../../../core/org/org.store';
import { VideoCallService } from '../../../core/video/video-call.service';
import { WhiteboardState } from '../../../core/video/whiteboard-state';
import { VideoTile } from './video-tile';
import { Whiteboard } from './whiteboard';

type Phase = 'prejoin' | 'incall' | 'left';
type Panel = 'none' | 'chat' | 'board';

const str = (v: string | string[]): string => (typeof v === 'string' ? v : '');

@Component({
  selector: 'app-call-room',
  imports: [
    RouterLink, NgIcon, VideoTile, Whiteboard, ZardBadgeComponent, ZardButtonComponent,
    ZardDialogImports, ZardSelectImports,
  ],
  providers: [VideoCallService, WhiteboardState],
  viewProviders: [
    provideIcons({
      lucideMessageSquare, lucideMic, lucideMicOff, lucideMonitorUp, lucidePenLine,
      lucidePhoneOff, lucideSend, lucideVideo, lucideVideoOff,
    }),
  ],
  // `dark` re-escopa os tokens: a sala usa o tema escuro mesmo com o app em tema claro.
  template: `
    <div class="dark fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      <p class="sr-only" role="status">{{ call.announcement() }}</p>

      <header class="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div class="min-w-0">
          <h1 class="truncate font-display text-base font-bold">{{ session.value()?.subject?.name ?? 'Chamada' }}</h1>
          <p class="truncate text-xs text-muted-foreground">
            {{ session.value()?.monitor?.full_name }}
            @if (phase() === 'incall') { · {{ call.participants().length }} na chamada }
          </p>
        </div>
        @if (phase() === 'incall') {
          <z-badge [zType]="call.status() === 'connected' ? 'secondary' : 'destructive'">
            {{ call.status() === 'connected' ? 'Conectado' : 'Reconectando…' }}
          </z-badge>
        }
      </header>

      @switch (phase()) {
        @case ('prejoin') {
          <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 overflow-auto p-4">
            @if (session.error()) {
              <p role="alert" class="text-destructive">Sessão não encontrada.</p>
            } @else if (session.value() && !session.value()!.in_app_call) {
              <p role="alert">Esta sessão não usa a videochamada do Monitora+.</p>
            } @else {
              <h2 class="font-display text-2xl font-extrabold">Pronto para entrar?</h2>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  <video #preview autoplay playsinline muted class="size-full scale-x-[-1] object-cover" [class.hidden]="!previewOn()"></video>
                  @if (!previewOn()) {
                    <p class="grid size-full place-items-center p-4 text-center text-sm text-muted-foreground">
                      {{ previewError() || 'Câmera desligada' }}
                    </p>
                  }
                </div>
                <div class="flex flex-col gap-3">
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" class="size-4 accent-[var(--primary)]" [checked]="wantCam()" (change)="wantCam.set($any($event.target).checked); startPreview()" />
                    Entrar com a câmera ligada
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" class="size-4 accent-[var(--primary)]" [checked]="wantMic()" (change)="wantMic.set($any($event.target).checked); startPreview()" />
                    Entrar com o microfone ligado
                  </label>
                  @if (cameras().length > 1) {
                    <z-select aria-label="Câmera" [zValue]="cameraId()" (zSelectionChange)="cameraId.set(str($event)); startPreview()">
                      @for (d of cameras(); track d.deviceId) { <z-select-item [zValue]="d.deviceId">{{ d.label || 'Câmera' }}</z-select-item> }
                    </z-select>
                  }
                  @if (mics().length > 1) {
                    <z-select aria-label="Microfone" [zValue]="micId()" (zSelectionChange)="micId.set(str($event)); startPreview()">
                      @for (d of mics(); track d.deviceId) { <z-select-item [zValue]="d.deviceId">{{ d.label || 'Microfone' }}</z-select-item> }
                    </z-select>
                  }
                  <p class="text-xs text-muted-foreground">Esta chamada não é gravada.</p>
                </div>
              </div>
              @if (call.error()) { <p role="alert" class="text-sm text-destructive">{{ call.error() }}</p> }
              <div class="flex flex-wrap gap-2">
                <button z-button zSize="lg" type="button" [zLoading]="call.status() === 'connecting'" [zDisabled]="!session.value()" (click)="join()">Entrar na chamada</button>
                <a z-button zSize="lg" zType="outline" [routerLink]="org.link('sessoes', id())">Voltar</a>
              </div>
            }
          </main>
        }

        @case ('incall') {
          <div class="flex min-h-0 flex-1 flex-col md:flex-row">
            <main class="min-h-0 flex-1 overflow-auto p-3">
              @if (call.notice()) { <p role="status" class="mb-2 rounded-md bg-muted px-3 py-2 text-sm">{{ call.notice() }}</p> }
              @if (call.needsAudioUnlock()) {
                <button z-button class="mb-2" type="button" (click)="call.unlockAudio()">Ativar áudio da chamada</button>
              }
              <div class="grid gap-2" [class]="gridClass()">
                @for (tile of call.tiles(); track tile.key) {
                  <app-video-tile [class.col-span-full]="tile.source === 'screen'" [tile]="tile" [revision]="call.revision()" [speaking]="call.speaking().has(tile.participant.identity)" />
                }
              </div>
              @if (call.participants().length === 1) {
                <p class="mt-4 text-center text-sm text-muted-foreground">Aguardando os outros participantes entrarem…</p>
              }
            </main>

            @if (panel() !== 'none') {
              <aside class="flex h-[55%] min-h-0 flex-col border-t p-3 md:h-auto md:border-t-0 md:border-l" [class]="panel() === 'board' ? 'md:w-[56%]' : 'md:w-96'" [attr.aria-label]="panel() === 'chat' ? 'Chat' : 'Quadro branco'">
                @if (panel() === 'chat') {
                  <ul #log class="flex-1 space-y-2 overflow-auto" role="log" aria-live="polite" aria-label="Mensagens do chat">
                    @for (m of call.chat(); track m.id) {
                      <li class="rounded-lg px-3 py-2 text-sm" [class]="m.mine ? 'ml-8 bg-primary text-primary-foreground' : 'mr-8 bg-muted'">
                        @if (!m.mine) { <p class="text-xs font-semibold opacity-80">{{ m.name }}</p> }
                        <p class="break-words whitespace-pre-wrap">{{ m.text }}</p>
                      </li>
                    } @empty {
                      <li class="text-sm text-muted-foreground">Nenhuma mensagem ainda.</li>
                    }
                  </ul>
                  <form class="mt-2 flex gap-2" (submit)="$event.preventDefault(); send()">
                    <input class="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Mensagem" maxlength="1000" placeholder="Escreva uma mensagem" [value]="draft()" (input)="draft.set($any($event.target).value)" />
                    <button z-button zSize="icon" type="submit" aria-label="Enviar mensagem" [zDisabled]="!draft().trim()"><ng-icon name="lucideSend" aria-hidden="true" /></button>
                  </form>
                } @else {
                  <app-whiteboard [isMonitor]="isMonitor()" />
                }
              </aside>
            }
          </div>

          <footer class="flex flex-wrap items-center justify-center gap-2 border-t px-3 py-3" role="toolbar" aria-label="Controles da chamada">
            <button z-button [zType]="call.micOn() ? 'secondary' : 'destructive'" zSize="icon-lg" type="button" [attr.aria-pressed]="call.micOn()" [attr.aria-label]="call.micOn() ? 'Desligar microfone' : 'Ligar microfone'" (click)="call.toggleMic()">
              <ng-icon [name]="call.micOn() ? 'lucideMic' : 'lucideMicOff'" aria-hidden="true" />
            </button>
            <button z-button [zType]="call.camOn() ? 'secondary' : 'destructive'" zSize="icon-lg" type="button" [attr.aria-pressed]="call.camOn()" [attr.aria-label]="call.camOn() ? 'Desligar câmera' : 'Ligar câmera'" (click)="call.toggleCamera()">
              <ng-icon [name]="call.camOn() ? 'lucideVideo' : 'lucideVideoOff'" aria-hidden="true" />
            </button>
            @if (call.canShareScreen) {
              <button z-button [zType]="call.screenOn() ? 'default' : 'secondary'" zSize="icon-lg" type="button" [attr.aria-pressed]="call.screenOn()" [attr.aria-label]="call.screenOn() ? 'Parar de compartilhar a tela' : 'Compartilhar a tela'" (click)="call.toggleScreenShare()">
                <ng-icon name="lucideMonitorUp" aria-hidden="true" />
              </button>
            }
            <button z-button [zType]="panel() === 'chat' ? 'default' : 'secondary'" zSize="icon-lg" type="button" [attr.aria-pressed]="panel() === 'chat'" aria-label="Chat" (click)="togglePanel('chat')">
              <ng-icon name="lucideMessageSquare" aria-hidden="true" />
            </button>
            <button z-button [zType]="panel() === 'board' ? 'default' : 'secondary'" zSize="icon-lg" type="button" [attr.aria-pressed]="panel() === 'board'" aria-label="Quadro branco" (click)="togglePanel('board')">
              <ng-icon name="lucidePenLine" aria-hidden="true" />
            </button>
            <button z-button zType="destructive" zSize="lg" type="button" (click)="leave()">
              <ng-icon name="lucidePhoneOff" aria-hidden="true" />Sair
            </button>
            @if (isMonitor() && session.value()?.status === 'in_progress') {
              <button z-button zType="outline" zSize="lg" type="button" (click)="endOpen.set(true)">Encerrar sessão</button>
            }
          </footer>
        }

        @case ('left') {
          <main class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
            <h2 class="font-display text-2xl font-extrabold">Você saiu da chamada</h2>
            @if (call.error()) { <p role="alert" class="text-sm text-destructive">{{ call.error() }}</p> }
            <div class="flex flex-wrap justify-center gap-2">
              <button z-button type="button" (click)="phase.set('prejoin')">Entrar novamente</button>
              <a z-button zType="outline" [routerLink]="org.link('sessoes', id())">Voltar para a sessão</a>
            </div>
          </main>
        }
      }

      <z-dialog [(zVisible)]="endOpen">
        <z-dialog-header>
          <z-dialog-title zTitle="Encerrar a sessão?" />
          <z-dialog-description zDescription="A chamada termina para todos, seus créditos são lançados e os alunos presentes poderão avaliar a monitoria." />
        </z-dialog-header>
        <z-dialog-footer>
          <button z-button zType="outline" type="button" (click)="endOpen.set(false)">Voltar</button>
          <button z-button type="button" [zLoading]="ending()" (click)="endSession()">Encerrar sessão</button>
        </z-dialog-footer>
      </z-dialog>
    </div>
  `,
})
export class CallRoom {
  readonly id = input.required<string>();

  protected readonly call = inject(VideoCallService);
  protected readonly org = inject(OrgStore);
  private readonly board = inject(WhiteboardState);
  private readonly auth = inject(AuthStore);
  private readonly sessionsApi = inject(SessionsApi);
  private readonly callApi = inject(CallApi);
  private readonly sonner = inject(ZardSonnerService);
  private readonly router = inject(Router);

  protected readonly str = str;
  protected readonly phase = signal<Phase>('prejoin');
  protected readonly panel = signal<Panel>('none');
  protected readonly draft = signal('');
  protected readonly endOpen = signal(false);
  protected readonly ending = signal(false);

  protected readonly session = resource({
    params: () => this.id(),
    loader: ({ params }) => this.sessionsApi.get(params),
  });
  protected readonly isMonitor = computed(
    () => !!this.session.value() && this.session.value()!.monitor_id === this.auth.user()?.id,
  );
  protected readonly gridClass = computed(() => {
    const n = this.call.tiles().length;
    return n <= 1 ? 'mx-auto max-w-3xl grid-cols-1' : n === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3';
  });

  // pré-visualização
  protected readonly wantCam = signal(true);
  protected readonly wantMic = signal(true);
  protected readonly cameras = signal<MediaDeviceInfo[]>([]);
  protected readonly mics = signal<MediaDeviceInfo[]>([]);
  protected readonly cameraId = signal('');
  protected readonly micId = signal('');
  protected readonly previewOn = signal(false);
  protected readonly previewError = signal('');
  private stream: MediaStream | null = null;
  private readonly previewEl = viewChild<ElementRef<HTMLVideoElement>>('preview');
  private readonly logEl = viewChild<ElementRef<HTMLUListElement>>('log');

  constructor() {
    effect(() => {
      const el = this.previewEl()?.nativeElement;
      if (el && this.stream && el.srcObject !== this.stream) {
        el.srcObject = this.stream;
      }
    });
    effect(() => {
      this.call.chat();
      const el = this.logEl()?.nativeElement;
      if (el) {
        setTimeout(() => (el.scrollTop = el.scrollHeight));
      }
    });
    effect((onCleanup) => {
      if (this.phase() === 'prejoin') {
        void this.startPreview();
        onCleanup(() => this.stopPreview());
      }
    });
  }

  protected async startPreview(): Promise<void> {
    this.stopPreview();
    if (!this.wantCam() && !this.wantMic()) {
      this.previewOn.set(false);
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: this.wantCam() ? (this.cameraId() ? { deviceId: { exact: this.cameraId() } } : true) : false,
        audio: this.wantMic() ? (this.micId() ? { deviceId: { exact: this.micId() } } : true) : false,
      });
      this.previewError.set('');
      this.previewOn.set(this.wantCam());
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameras.set(devices.filter((d) => d.kind === 'videoinput'));
      this.mics.set(devices.filter((d) => d.kind === 'audioinput'));
      const el = this.previewEl()?.nativeElement;
      if (el) {
        el.srcObject = this.stream;
      }
    } catch {
      this.previewOn.set(false);
      this.previewError.set(
        'Não foi possível acessar a câmera ou o microfone. Você pode entrar mesmo assim e ativá-los depois.',
      );
    }
  }

  protected async join(): Promise<void> {
    const allowed = !this.previewError();
    this.stopPreview();
    await this.call.join(this.id(), {
      mic: this.wantMic() && allowed,
      camera: this.wantCam() && allowed,
      micDeviceId: this.micId() || undefined,
      cameraDeviceId: this.cameraId() || undefined,
    });
    if (this.call.status() === 'connected') {
      const session = this.session.value();
      this.board.start(session?.monitor_id ?? '', this.isMonitor());
      this.phase.set('incall');
    } else {
      void this.startPreview();
    }
  }

  protected async leave(): Promise<void> {
    await this.call.leave();
    this.panel.set('none');
    this.phase.set('left');
  }

  protected togglePanel(panel: Exclude<Panel, 'none'>): void {
    this.panel.update((current) => (current === panel ? 'none' : panel));
  }

  protected async send(): Promise<void> {
    const text = this.draft();
    this.draft.set('');
    await this.call.sendChat(text);
  }

  protected async endSession(): Promise<void> {
    this.ending.set(true);
    try {
      const earned = await this.sessionsApi.end(this.id());
      await this.callApi.closeRoom(this.id());
      await this.call.leave();
      await this.org.refresh();
      this.sonner.success(earned > 0 ? 'Sessão encerrada e créditos lançados! Avalie os alunos presentes.' : 'Sessão encerrada sem presenças confirmadas.');
      this.endOpen.set(false);
      await this.router.navigate(this.org.link('sessoes', this.id()));
    } catch (err) {
      this.sonner.error(errorMessage(err));
    } finally {
      this.ending.set(false);
    }
  }

  private stopPreview(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
