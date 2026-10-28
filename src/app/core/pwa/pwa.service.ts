import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, computed, inject, signal } from '@angular/core';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

import { ZardSonnerService } from '@/shared/components/sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Estado do PWA: conexão, instalação e atualização do app. */
@Service()
export class PwaService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly sonner = inject(ZardSonnerService);
  private readonly sw = inject(SwUpdate, { optional: true });

  readonly online = signal(true);
  private readonly installEvent = signal<BeforeInstallPromptEvent | null>(null);
  readonly canInstall = computed(() => this.installEvent() !== null);
  /** iPhone/iPad no Safari: não há prompt de instalação, só o passo manual. */
  readonly showIosHint = signal(false);

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    this.online.set(navigator.onLine);
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installEvent.set(event as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => this.installEvent.set(null));

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    this.showIosHint.set(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);

    this.watchUpdates();
  }

  async install(): Promise<void> {
    const event = this.installEvent();
    if (!event) {
      return;
    }
    await event.prompt();
    await event.userChoice;
    this.installEvent.set(null);
  }

  private watchUpdates(): void {
    const sw = this.sw;
    if (!sw?.isEnabled) {
      return;
    }
    sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        this.sonner.info('Nova versão do Monitora+ disponível.', {
          duration: Infinity,
          action: {
            label: 'Atualizar',
            onClick: () => void sw.activateUpdate().then(() => document.location.reload()),
          },
        });
      });

    // procura atualização ao voltar para o app (PWAs ficam abertos por dias)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void sw.checkForUpdate().catch(() => undefined);
      }
    });
  }
}
