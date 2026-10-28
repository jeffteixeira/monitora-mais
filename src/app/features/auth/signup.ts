import { Component, inject, input, signal } from '@angular/core';
import { FormField, FormRoot, email, form, minLength, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSonnerService } from '@/shared/components/sonner';

import { errorMessage } from '../../core/api/unwrap';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import { safeRedirect } from '../../core/util/redirect';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-signup',
  imports: [FormField, FormRoot, RouterLink, AuthLayout, ZardButtonComponent, ZardInputComponent, ZardFieldImports],
  template: `
    <app-auth-layout heading="Criar conta" subheading="Crie sua conta e entre na organização da sua faculdade ou comunidade.">
      <form [formRoot]="signupForm" class="flex flex-col gap-6">
        <z-field-group>
          <div z-field [attr.data-invalid]="signupForm.fullName().touched() && signupForm.fullName().invalid() ? '' : null">
            <label z-field-label for="name">Nome completo</label>
            <input z-input id="name" autocomplete="name" [formField]="signupForm.fullName"
              [attr.aria-invalid]="signupForm.fullName().touched() && signupForm.fullName().invalid() ? 'true' : null" />
            @if (signupForm.fullName().touched()) {
              <z-field-error [zErrors]="signupForm.fullName().errors()" />
            }
          </div>

          <div z-field [attr.data-invalid]="signupForm.email().touched() && signupForm.email().invalid() ? '' : null">
            <label z-field-label for="email">E-mail</label>
            <input z-input id="email" type="email" autocomplete="email" [formField]="signupForm.email"
              [attr.aria-invalid]="signupForm.email().touched() && signupForm.email().invalid() ? 'true' : null" />
            @if (signupForm.email().touched()) {
              <z-field-error [zErrors]="signupForm.email().errors()" />
            }
          </div>

          <div z-field [attr.data-invalid]="signupForm.password().touched() && signupForm.password().invalid() ? '' : null">
            <label z-field-label for="password">Senha</label>
            <input z-input id="password" type="password" autocomplete="new-password" [formField]="signupForm.password"
              [attr.aria-invalid]="signupForm.password().touched() && signupForm.password().invalid() ? 'true' : null"
              aria-describedby="password-help" />
            <p z-field-description id="password-help">Mínimo de 8 caracteres.</p>
            @if (signupForm.password().touched()) {
              <z-field-error [zErrors]="signupForm.password().errors()" />
            }
          </div>
        </z-field-group>

        @if (error()) {
          <p role="alert" class="text-sm text-destructive">{{ error() }}</p>
        }

        <button z-button zSize="lg" type="submit" [zLoading]="signupForm().submitting()">Criar conta</button>
        <p class="text-center text-sm text-muted-foreground">
          Já tem conta?
          <a routerLink="/entrar" [queryParams]="{ redirect: redirect() }" class="font-medium text-primary underline-offset-4 hover:underline">Entrar</a>
        </p>
      </form>
    </app-auth-layout>
  `,
})
export class Signup {
  readonly redirect = input<string>();

  private readonly auth = inject(AuthStore);
  private readonly org = inject(OrgStore);
  private readonly router = inject(Router);
  private readonly sonner = inject(ZardSonnerService);

  protected readonly error = signal('');

  private readonly model = signal({ fullName: '', email: '', password: '' });

  protected readonly signupForm = form(
    this.model,
    (p) => {
      required(p.fullName, { message: 'Informe seu nome.' });
      minLength(p.fullName, 2, { message: 'Nome muito curto.' });
      required(p.email, { message: 'Informe seu e-mail.' });
      email(p.email, { message: 'E-mail inválido.' });
      required(p.password, { message: 'Crie uma senha.' });
      minLength(p.password, 8, { message: 'A senha precisa ter ao menos 8 caracteres.' });
    },
    {
      submission: {
        action: async () => {
          this.error.set('');
          try {
            const { fullName, email, password } = this.model();
            const needsConfirmation = await this.auth.signUp(email.trim(), password, fullName.trim());
            if (needsConfirmation) {
              this.sonner.success('Conta criada! Confirme seu e-mail para entrar.');
              await this.router.navigate(['/entrar'], { queryParams: { redirect: this.redirect() } });
            } else {
              await this.router.navigateByUrl(safeRedirect(this.redirect()) ?? (await this.org.homeUrl()));
            }
          } catch (err) {
            this.error.set(errorMessage(err));
          }
        },
      },
    },
  );
}
