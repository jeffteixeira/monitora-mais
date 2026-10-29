import { Component, DOCUMENT, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ZardSonnerComponent } from '@/shared/components/sonner';

import { ZardDarkMode } from '@/shared/services/dark-mode';

import { OfflineBanner } from './core/pwa/offline-banner';
import { PwaService } from './core/pwa/pwa.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ZardSonnerComponent, OfflineBanner],
  template: `
    <app-offline-banner />
    <router-outlet />
    <z-sonner />
  `,
})
export class App {
  // instancia o serviço no início para capturar `beforeinstallprompt` e avisos de atualização
  private readonly pwa = inject(PwaService);
  private readonly darkMode = inject(ZardDarkMode);
  private readonly document = inject(DOCUMENT);

  constructor() {
    // a barra do navegador/PWA acompanha o tema aplicado
    effect(() => {
      const color = this.darkMode.themeMode() === 'dark' ? '#0a0a0a' : '#0f6b6a';
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    });
  }
}
