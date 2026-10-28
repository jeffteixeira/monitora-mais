import { Component, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

import { OrgApi } from '../../core/api/org.api';
import { errorMessage } from '../../core/api/unwrap';
import { OrgStore } from '../../core/org/org.store';
import { SimpleHeader } from '../organizations/simple-header';

@Component({
  selector: 'app-invite',
  imports: [SimpleHeader, ZardButtonComponent, ZardCardImports, ZardSkeletonComponent],
  template: `
    <app-simple-header />
    <main class="mx-auto max-w-md px-4 py-12">
      @if (preview.isLoading()) {
        <z-skeleton class="h-40 w-full rounded-xl" />
      } @else if (preview.value(); as p) {
        <z-card>
          <z-card-header>
            <z-card-title [zTitle]="'Você foi convidado para ' + (p.name)" />
            @if (p.description) { <z-card-description [zDescription]="p.description" /> }
          </z-card-header>
          <z-card-content class="flex flex-col gap-3">
            @if (error()) { <p role="alert" class="text-sm text-destructive">{{ error() }}</p> }
            @if (p.already_member) {
              <p class="text-sm text-muted-foreground">Você já participa desta organização.</p>
            }
            <button z-button type="button" [zLoading]="busy()" (click)="accept(p.slug, p.already_member)">
              {{ p.already_member ? 'Abrir organização' : 'Entrar na organização' }}
            </button>
          </z-card-content>
        </z-card>
      } @else {
        <z-card>
          <z-card-header>
            <z-card-title zTitle="Convite inválido" />
            <z-card-description zDescription="O código não existe ou foi renovado pelo administrador. Peça um novo convite." />
          </z-card-header>
        </z-card>
      }
    </main>
  `,
})
export class Invite {
  readonly code = input.required<string>();

  private readonly api = inject(OrgApi);
  private readonly org = inject(OrgStore);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly preview = resource({
    params: () => this.code(),
    loader: ({ params }) => this.api.previewInvite(params),
  });

  protected async accept(slug: string, alreadyMember: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      if (!alreadyMember) {
        await this.api.join(this.code());
        await this.org.refresh();
      }
      await this.router.navigate(['/o', slug, 'inicio']);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
