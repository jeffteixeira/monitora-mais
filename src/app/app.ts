import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ZardSonnerComponent } from '@/shared/components/sonner';

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
}
