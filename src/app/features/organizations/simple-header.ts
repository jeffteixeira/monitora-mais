import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ZardButtonComponent } from '@/shared/components/button';

import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import { ThemeSelector } from '../../shared/ui/theme-selector';

/** Cabeçalho das telas fora de uma organização (lista de organizações, convite). */
@Component({
  selector: 'app-simple-header',
  imports: [RouterLink, ThemeSelector, ZardButtonComponent],
  template: `
    <header class="border-b">
      <div class="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <a routerLink="/organizacoes" class="font-display text-lg font-extrabold">Monitora<span class="text-gold">+</span></a>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-muted-foreground sm:inline">{{ auth.profile()?.full_name }}</span>
          <app-theme-selector />
          <button z-button zType="outline" zSize="sm" type="button" (click)="signOut()">Sair</button>
        </div>
      </div>
    </header>
  `,
})
export class SimpleHeader {
  protected readonly auth = inject(AuthStore);
  private readonly org = inject(OrgStore);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.org.clear();
    await this.router.navigateByUrl('/');
  }
}
