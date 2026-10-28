import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCopy, lucideRefreshCw } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogImports } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardTextareaComponent } from '@/shared/components/textarea';

import { CallApi } from '../../core/api/call.api';
import { OrgApi } from '../../core/api/org.api';
import { OrgStore } from '../../core/org/org.store';
import { adminError } from './admin-util';

@Component({
  selector: 'app-admin-settings',
  imports: [NgIcon, ZardButtonComponent, ZardCardImports, ZardDialogImports, ZardFieldImports, ZardInputComponent, ZardTextareaComponent],
  viewProviders: [provideIcons({ lucideCheck, lucideCopy, lucideRefreshCw })],
  template: `
    <div class="grid gap-4 lg:grid-cols-2">
      <z-card>
        <z-card-header><z-card-title zTitle="Organização" /></z-card-header>
        <z-card-content>
          <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); save()">
            <div z-field>
              <label z-field-label for="o-name">Nome</label>
              <input z-input id="o-name" required minlength="2" [value]="name()" (input)="name.set($any($event.target).value)" />
            </div>
            <div z-field>
              <label z-field-label for="o-desc">Descrição</label>
              <textarea z-textarea id="o-desc" rows="3" maxlength="300" [value]="description()" (input)="description.set($any($event.target).value)"></textarea>
            </div>
            <div z-field>
              <label z-field-label for="o-welcome">Créditos de boas-vindas (horas)</label>
              <input z-input id="o-welcome" type="number" min="0" max="100" step="0.5" aria-describedby="o-welcome-help" [value]="welcome()" (input)="welcome.set(+$any($event.target).value)" />
              <p z-field-description id="o-welcome-help">Concedidos a quem entra a partir de agora.</p>
            </div>
            <button z-button type="submit" [zLoading]="busy()">Salvar</button>
          </form>
        </z-card-content>
      </z-card>

      <div class="flex flex-col gap-4">
        <z-card>
          <z-card-header>
            <z-card-title zTitle="Convite" />
            <z-card-description zDescription="Quem tiver este link entra como membro. Renove o código para invalidar o anterior." />
          </z-card-header>
          <z-card-content class="flex flex-col gap-3">
            <code class="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{{ link() }}</code>
            <p class="text-sm text-muted-foreground">Código: <strong class="font-mono">{{ org.current()?.org?.invite_code }}</strong></p>
            <div class="flex flex-wrap gap-2">
              <button z-button zType="outline" type="button" (click)="copy()">
                <ng-icon [name]="copied() ? 'lucideCheck' : 'lucideCopy'" aria-hidden="true" />{{ copied() ? 'Copiado' : 'Copiar link' }}
              </button>
              <button z-button zType="outline" type="button" (click)="rotateOpen.set(true)">
                <ng-icon name="lucideRefreshCw" aria-hidden="true" />Renovar código
              </button>
            </div>
          </z-card-content>
        </z-card>

        <z-card>
          <z-card-header>
            <z-card-title zTitle="Videochamadas no mês" />
            <z-card-description zDescription="Tempo total de participantes em chamadas integradas, no mês corrente." />
          </z-card-header>
          <z-card-content>
            <p class="font-display text-3xl font-extrabold" aria-live="polite">{{ usage.value()?.minutes ?? 0 }} <span class="text-base font-medium text-muted-foreground">min de participante</span></p>
            <p class="text-sm text-muted-foreground">em {{ usage.value()?.calls ?? 0 }} sessão(ões)</p>
          </z-card-content>
        </z-card>

        <z-card>
          <z-card-header>
            <z-card-title zTitle="Saldo do semestre" />
            <z-card-description zDescription="Concede créditos a todos os membros ativos de uma vez." />
          </z-card-header>
          <z-card-content>
            <form class="flex items-end gap-2" (submit)="$event.preventDefault(); grant()">
              <div z-field class="flex-1">
                <label z-field-label for="o-grant">Horas por membro</label>
                <input z-input id="o-grant" type="number" min="0.5" max="100" step="0.5" [value]="grantAmount()" (input)="grantAmount.set(+$any($event.target).value)" />
              </div>
              <button z-button type="submit" [zLoading]="busy()">Conceder</button>
            </form>
          </z-card-content>
        </z-card>
      </div>
    </div>

    <z-dialog [(zVisible)]="rotateOpen">
      <z-dialog-header>
        <z-dialog-title zTitle="Renovar código de convite?" />
        <z-dialog-description zDescription="O link e o código atuais deixam de funcionar. Quem já é membro não é afetado." />
      </z-dialog-header>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" (click)="rotateOpen.set(false)">Voltar</button>
        <button z-button type="button" [zLoading]="busy()" (click)="rotate()">Renovar</button>
      </z-dialog-footer>
    </z-dialog>
  `,
})
export class AdminSettings {
  protected readonly org = inject(OrgStore);
  private readonly api = inject(OrgApi);
  private readonly callApi = inject(CallApi);
  protected readonly usage = resource({ loader: () => this.callApi.monthlyUsage() });
  private readonly sonner = inject(ZardSonnerService);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly welcome = signal(5);
  protected readonly grantAmount = signal(5);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  protected readonly rotateOpen = signal(false);

  protected readonly link = computed(
    () => `${globalThis.location?.origin ?? ''}/convite/${this.org.current()?.org.invite_code ?? ''}`,
  );

  constructor() {
    effect(() => {
      const o = this.org.current()?.org;
      if (o) {
        this.name.set(o.name);
        this.description.set(o.description ?? '');
        this.welcome.set(Number(o.welcome_credits));
      }
    });
  }

  protected save(): Promise<void> {
    return this.run(async () => {
      await this.api.update(this.name().trim(), this.description().trim(), this.welcome());
      await this.org.refresh();
      this.sonner.success('Organização atualizada.');
    });
  }

  protected rotate(): Promise<void> {
    return this.run(async () => {
      await this.api.rotateInvite();
      await this.org.refresh();
      this.rotateOpen.set(false);
      this.sonner.success('Novo código de convite gerado.');
    });
  }

  protected grant(): Promise<void> {
    return this.run(async () => {
      const count = await this.api.grantCredits(this.grantAmount());
      await this.org.refresh();
      this.sonner.success(`Créditos concedidos a ${count} membro(s).`);
    });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.sonner.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (err) {
      this.sonner.error(adminError(err));
    } finally {
      this.busy.set(false);
    }
  }
}
