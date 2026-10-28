import { Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, minLength, pattern, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardTextareaComponent } from '@/shared/components/textarea';

import { OrgApi } from '../../core/api/org.api';
import { errorMessage } from '../../core/api/unwrap';
import { OrgStore } from '../../core/org/org.store';
import { SimpleHeader } from './simple-header';

const ROLE_LABEL = { owner: 'Proprietário', admin: 'Administrador', member: 'Membro' } as const;

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

@Component({
  selector: 'app-organizations',
  imports: [
    FormField, FormRoot, RouterLink, SimpleHeader, ZardBadgeComponent, ZardButtonComponent, ZardCardImports,
    ZardEmptyComponent, ZardFieldImports, ZardInputComponent, ZardTextareaComponent,
  ],
  template: `
    <app-simple-header />
    <main class="mx-auto max-w-4xl px-4 py-8">
      <h1 class="font-display text-3xl font-extrabold">Minhas organizações</h1>
      <p class="mt-1 text-muted-foreground">Cada organização tem sua própria carteira, ranking e catálogo.</p>

      <section class="mt-6" aria-label="Organizações das quais você participa">
        @if (org.memberships().length === 0) {
          <z-empty zTitle="Você ainda não participa de nenhuma organização" zDescription="Entre com um código de convite ou crie a sua." />
        } @else {
          <ul class="grid gap-3 sm:grid-cols-2">
            @for (m of org.memberships(); track m.org.id) {
              <li class="flex flex-col gap-2 rounded-xl border p-4">
                <div class="flex items-start justify-between gap-2">
                  <h2 class="font-display text-lg font-bold">{{ m.org.name }}</h2>
                  <z-badge zType="secondary">{{ roleLabel[m.role] }}</z-badge>
                </div>
                @if (m.org.description) { <p class="text-sm text-muted-foreground">{{ m.org.description }}</p> }
                <a z-button zSize="sm" class="mt-auto w-fit" [routerLink]="['/o', m.org.slug, 'inicio']">Abrir</a>
              </li>
            }
          </ul>
        }
      </section>

      <div class="mt-10 grid gap-4 md:grid-cols-2">
        <z-card>
          <z-card-header>
            <z-card-title zTitle="Entrar com código" />
            <z-card-description zDescription="Peça o código de convite ao administrador da organização." />
          </z-card-header>
          <z-card-content>
            <form [formRoot]="joinForm" class="flex flex-col gap-4">
              <div z-field [attr.data-invalid]="joinForm.code().touched() && joinForm.code().invalid() ? '' : null">
                <label z-field-label for="code">Código</label>
                <input z-input id="code" autocomplete="off" class="uppercase" [formField]="joinForm.code"
                  [attr.aria-invalid]="joinForm.code().touched() && joinForm.code().invalid() ? 'true' : null" />
                @if (joinForm.code().touched()) { <z-field-error [zErrors]="joinForm.code().errors()" /> }
              </div>
              @if (joinError()) { <p role="alert" class="text-sm text-destructive">{{ joinError() }}</p> }
              <button z-button type="submit" [zLoading]="joinForm().submitting()">Entrar</button>
            </form>
          </z-card-content>
        </z-card>

        <z-card>
          <z-card-header>
            <z-card-title zTitle="Criar organização" />
            <z-card-description zDescription="Você será o proprietário e receberá um catálogo inicial para editar." />
          </z-card-header>
          <z-card-content>
            <form [formRoot]="createForm" class="flex flex-col gap-4">
              <z-field-group>
                <div z-field [attr.data-invalid]="createForm.name().touched() && createForm.name().invalid() ? '' : null">
                  <label z-field-label for="org-name">Nome</label>
                  <input z-input id="org-name" [formField]="createForm.name"
                    [attr.aria-invalid]="createForm.name().touched() && createForm.name().invalid() ? 'true' : null"
                    (input)="suggestSlug()" />
                  @if (createForm.name().touched()) { <z-field-error [zErrors]="createForm.name().errors()" /> }
                </div>
                <div z-field [attr.data-invalid]="createForm.slug().touched() && createForm.slug().invalid() ? '' : null">
                  <label z-field-label for="org-slug">Endereço</label>
                  <input z-input id="org-slug" autocomplete="off" [formField]="createForm.slug"
                    [attr.aria-invalid]="createForm.slug().touched() && createForm.slug().invalid() ? 'true' : null"
                    aria-describedby="slug-help" (input)="slugEdited.set(true)" />
                  <p z-field-description id="slug-help">/o/{{ createForm.slug().value() || 'endereco' }} — letras minúsculas, números e hífen.</p>
                  @if (createForm.slug().touched()) { <z-field-error [zErrors]="createForm.slug().errors()" /> }
                </div>
                <div z-field>
                  <label z-field-label for="org-desc">Descrição (opcional)</label>
                  <textarea z-textarea id="org-desc" rows="2" maxlength="300" [formField]="createForm.description"></textarea>
                </div>
              </z-field-group>
              @if (createError()) { <p role="alert" class="text-sm text-destructive">{{ createError() }}</p> }
              <button z-button type="submit" [zLoading]="createForm().submitting()">Criar organização</button>
            </form>
          </z-card-content>
        </z-card>
      </div>
    </main>
  `,
})
export class Organizations {
  protected readonly org = inject(OrgStore);
  private readonly api = inject(OrgApi);
  private readonly router = inject(Router);

  protected readonly roleLabel = ROLE_LABEL;
  protected readonly joinError = signal('');
  protected readonly createError = signal('');
  protected readonly slugEdited = signal(false);

  private readonly joinModel = signal({ code: '' });
  private readonly createModel = signal({ name: '', slug: '', description: '' });

  protected readonly joinForm = form(
    this.joinModel,
    (p) => {
      required(p.code, { message: 'Informe o código de convite.' });
    },
    {
      submission: {
        action: async () => {
          this.joinError.set('');
          try {
            const joined = await this.api.join(this.joinModel().code);
            await this.org.refresh();
            await this.router.navigate(['/o', joined.slug, 'inicio']);
          } catch (err) {
            this.joinError.set(errorMessage(err));
          }
        },
      },
    },
  );

  protected readonly createForm = form(
    this.createModel,
    (p) => {
      required(p.name, { message: 'Informe o nome da organização.' });
      minLength(p.name, 2, { message: 'Nome muito curto.' });
      required(p.slug, { message: 'Informe o endereço.' });
      pattern(p.slug, /^[a-z0-9-]{3,40}$/, {
        message: 'Use de 3 a 40 caracteres: letras minúsculas, números e hífen.',
      });
    },
    {
      submission: {
        action: async () => {
          this.createError.set('');
          try {
            const { name, slug, description } = this.createModel();
            const created = await this.api.create(name, slug, description);
            await this.org.refresh();
            await this.router.navigate(['/o', created.slug, 'inicio']);
          } catch (err) {
            this.createError.set(errorMessage(err));
          }
        },
      },
    },
  );

  protected suggestSlug(): void {
    if (!this.slugEdited()) {
      this.createModel.update((m) => ({ ...m, slug: slugify(m.name) }));
    }
  }
}
