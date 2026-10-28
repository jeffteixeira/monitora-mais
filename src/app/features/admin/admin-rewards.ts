import { Component, inject, resource, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardSwitchComponent } from '@/shared/components/switch';
import { ZardTableImports } from '@/shared/components/table';
import { ZardTextareaComponent } from '@/shared/components/textarea';

import { OrgApi } from '../../core/api/org.api';
import type { RewardKind } from '../../core/models';
import { adminError } from './admin-util';

@Component({
  selector: 'app-admin-rewards',
  imports: [NgIcon, ZardButtonComponent, ZardCardImports, ZardFieldImports, ZardInputComponent, ZardSelectImports, ZardSwitchComponent, ZardTableImports, ZardTextareaComponent],
  viewProviders: [provideIcons({ lucideTrash2 })],
  template: `
    <div class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <z-card>
        <z-card-header><z-card-title zTitle="Recompensas" /></z-card-header>
        <z-card-content>
          <table z-table>
            <caption class="sr-only">Recompensas da organização</caption>
            <thead z-table-header><tr z-table-row><th z-table-head>Título</th><th z-table-head>Custo</th><th z-table-head>Ativa</th><th z-table-head class="text-right">Ações</th></tr></thead>
            <tbody z-table-body>
              @for (r of rewards.value() ?? []; track r.id) {
                <tr z-table-row>
                  <td z-table-cell>{{ r.title }}</td>
                  <td z-table-cell>{{ r.cost }} h</td>
                  <td z-table-cell><z-switch [zChecked]="r.active" [attr.aria-label]="'Ativar ' + r.title" (zCheckedChange)="toggle(r.id, $event)" /></td>
                  <td z-table-cell class="text-right">
                    <button z-button zType="ghost" zSize="icon-sm" type="button" [attr.aria-label]="'Excluir ' + r.title" (click)="remove(r.id)">
                      <ng-icon name="lucideTrash2" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </z-card-content>
      </z-card>

      <z-card>
        <z-card-header><z-card-title zTitle="Nova recompensa" /></z-card-header>
        <z-card-content>
          <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); add()">
            <div z-field>
              <label z-field-label for="rw-title">Título</label>
              <input z-input id="rw-title" required [value]="title()" (input)="title.set($any($event.target).value)" />
            </div>
            <div z-field>
              <label z-field-label for="rw-desc">Descrição</label>
              <textarea z-textarea id="rw-desc" rows="2" required [value]="description()" (input)="description.set($any($event.target).value)"></textarea>
            </div>
            <div z-field>
              <label z-field-label for="rw-kind">Tipo</label>
              <z-select id="rw-kind" [(zValue)]="kind">
                <z-select-item zValue="horas_complementares">Horas complementares</z-select-item>
                <z-select-item zValue="acesso">Acesso</z-select-item>
                <z-select-item zValue="vantagem">Vantagem</z-select-item>
              </z-select>
            </div>
            <div z-field>
              <label z-field-label for="rw-cost">Custo (horas)</label>
              <input z-input id="rw-cost" type="number" min="0.5" step="0.5" required [value]="cost()" (input)="cost.set(+$any($event.target).value)" />
            </div>
            <button z-button type="submit">Adicionar</button>
          </form>
        </z-card-content>
      </z-card>
    </div>
  `,
})
export class AdminRewards {
  private readonly api = inject(OrgApi);
  private readonly sonner = inject(ZardSonnerService);

  protected readonly rewards = resource({ loader: () => this.api.allRewards() });
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly kind = signal<string | string[]>('vantagem');
  protected readonly cost = signal(2);

  protected add(): Promise<void> {
    return this.run(async () => {
      await this.api.addReward(
        this.title().trim(),
        this.description().trim(),
        this.kind() as RewardKind,
        this.cost(),
      );
      this.title.set('');
      this.description.set('');
    });
  }

  protected toggle(id: string, active: boolean): Promise<void> {
    return this.run(() => this.api.setRewardActive(id, active));
  }

  protected remove(id: string): Promise<void> {
    return this.run(() => this.api.deleteReward(id));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      this.sonner.error(adminError(err));
    }
    this.rewards.reload();
  }
}
