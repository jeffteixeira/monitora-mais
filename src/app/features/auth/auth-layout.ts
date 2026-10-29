import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ThemeSelector } from '../../shared/ui/theme-selector';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, ThemeSelector],
  template: `
    <div class="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside class="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <a routerLink="/" class="font-display text-2xl font-extrabold">Monitora<span class="text-gold">+</span></a>
        <div class="max-w-md">
          <p class="font-display text-5xl leading-[1.05] font-extrabold">
            Ensinar é a forma mais rápida de aprender.
          </p>
          <p class="mt-6 text-lg text-primary-foreground/80">
            1 hora de monitoria dada vira 1 crédito de tempo. Use para receber ajuda ou troque por horas complementares.
          </p>
        </div>
        <div class="flex items-center gap-3 text-sm text-primary-foreground/80">
          <span class="rounded-full bg-primary-foreground/15 px-3 py-1 font-semibold text-primary-foreground">+1,00 h</span>
          por hora de monitoria concluída
        </div>
        <div aria-hidden="true" class="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-primary-foreground/10"></div>
      </aside>

      <main class="relative flex items-center justify-center px-6 py-12">
        <app-theme-selector class="absolute top-4 right-4" />
        <div class="w-full max-w-sm">
          <a routerLink="/" class="mb-8 block font-display text-xl font-extrabold lg:hidden">Monitora<span class="text-gold">+</span></a>
          <h1 class="font-display text-3xl font-extrabold">{{ heading() }}</h1>
          <p class="mt-2 mb-8 text-muted-foreground">{{ subheading() }}</p>
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthLayout {
  readonly heading = input.required<string>();
  readonly subheading = input.required<string>();
}
