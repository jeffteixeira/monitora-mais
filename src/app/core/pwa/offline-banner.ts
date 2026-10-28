import { Component, inject } from '@angular/core';

import { PwaService } from './pwa.service';

@Component({
  selector: 'app-offline-banner',
  template: `
    @if (!pwa.online()) {
      <div role="status" class="bg-foreground px-4 py-2 text-center text-sm font-medium text-background">
        Você está offline. Reservas, check-in e atualizações voltam quando a conexão retornar.
      </div>
    }
  `,
})
export class OfflineBanner {
  protected readonly pwa = inject(PwaService);
}
