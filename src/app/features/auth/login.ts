import { Component, inject, input, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';

import { errorMessage } from '../../core/api/unwrap';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import { safeRedirect } from '../../core/util/redirect';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login',
  imports: [FormField, FormRoot, RouterLink, AuthLayout, ZardButtonComponent, ZardInputComponent, ZardFieldImports],
  template: `
    <app-auth-layout heading="Entrar" subheading="Acesse sua carteira de tempo e suas monitorias.">
      <form [formRoot]="loginForm" class="flex flex-col gap-6">
        <z-field-group>
          <div z-field [attr.data-invalid]="loginForm.email().touched() && loginForm.email().invalid() ? '' : null">
            <label z-field-label for="email">E-mail</label>
            <input z-input id="email" type="email" autocomplete="email" [formField]="loginForm.email"
              [attr.aria-invalid]="loginForm.email().touched() && loginForm.email().invalid() ? 'true' : null" />
            @if (loginForm.email().touched()) {
              <z-field-error [zErrors]="loginForm.email().errors()" />
            }
          </div>
          <div z-field [attr.data-invalid]="loginForm.password().touched() && loginForm.password().invalid() ? '' : null">
            <label z-field-label for="password">Senha</label>
            <input z-input id="password" type="password" autocomplete="current-password" [formField]="loginForm.password"
              [attr.aria-invalid]="loginForm.password().touched() && loginForm.password().invalid() ? 'true' : null" />
            @if (loginForm.password().touched()) {
              <z-field-error [zErrors]="loginForm.password().errors()" />
            }
          </div>
        </z-field-group>

        @if (error()) {
          <p role="alert" class="text-sm text-destructive">{{ error() }}</p>
        }

        <button z-button zSize="lg" type="submit" [zLoading]="loginForm().submitting()">Entrar</button>
        <p class="text-center text-sm text-muted-foreground">
          Novo por aqui?
          <a routerLink="/cadastro" [queryParams]="{ redirect: redirect() }" class="font-medium text-primary underline-offset-4 hover:underline">Criar conta</a>
        </p>
      </form>
    </app-auth-layout>
  `,
})
export class Login {
  readonly redirect = input<string>();

  private readonly auth = inject(AuthStore);
  private readonly org = inject(OrgStore);
  private readonly router = inject(Router);

  protected readonly error = signal('');
  private readonly model = signal({ email: '', password: '' });

  protected readonly loginForm = form(
    this.model,
    (p) => {
      required(p.email, { message: 'Informe seu e-mail.' });
      email(p.email, { message: 'E-mail inválido.' });
      required(p.password, { message: 'Informe sua senha.' });
    },
    {
      submission: {
        action: async () => {
          this.error.set('');
          try {
            const { email, password } = this.model();
            await this.auth.signIn(email.trim(), password);
            await this.router.navigateByUrl(safeRedirect(this.redirect()) ?? (await this.org.homeUrl()));
          } catch (err) {
            this.error.set(errorMessage(err));
          }
        },
      },
    },
  );
}
