import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogImports } from '@/shared/components/dialog';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardTableImports } from '@/shared/components/table';
import { ZardTabsImports } from '@/shared/components/tabs';

import { WalletApi } from '../../core/api/wallet.api';
import { errorMessage } from '../../core/api/unwrap';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import type { CreditTransaction, Reward } from '../../core/models';
import { formatCredits } from '../../core/util/format';

const KIND_LABEL: Record<CreditTransaction['kind'], string> = {
  initial_grant: 'Saldo inicial',
  hold: 'Reserva',
  hold_release: 'Reserva devolvida',
  earning: 'Monitoria concluída',
  redemption: 'Resgate',
};
const REWARD_KIND: Record<Reward['kind'], string> = {
  horas_complementares: 'Horas complementares',
  acesso: 'Acesso',
  vantagem: 'Vantagem',
};

@Component({
  selector: 'app-wallet',
  imports: [DatePipe, ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardDialogImports, ZardEmptyComponent, ZardTableImports, ZardTabsImports],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Carteira de tempo</h1>
    <div class="mt-4 rounded-2xl bg-primary p-6 text-primary-foreground">
      <p class="text-sm opacity-80">Saldo disponível</p>
      <p class="font-display text-5xl font-extrabold" aria-live="polite">{{ balance() }}</p>
      <p class="mt-1 text-sm opacity-80">Horas reservadas em sessões futuras já estão descontadas.</p>
    </div>

    <z-tab-group class="mt-6">
      <z-tab label="Resgatar">
        <div class="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          @for (r of rewards.value() ?? []; track r.id) {
            <z-card>
              <z-card-header>
                <z-card-title [zTitle]="r.title" />
                <z-card-description [zDescription]="r.description" />
              </z-card-header>
              <z-card-content class="flex items-center justify-between gap-2">
                <z-badge zType="secondary">{{ rewardKind[r.kind] }}</z-badge>
                <button z-button zSize="sm" type="button" [zDisabled]="org.balance() < r.cost" (click)="pending.set(r)">
                  Resgatar · {{ r.cost }} h
                </button>
              </z-card-content>
            </z-card>
          }
        </div>
      </z-tab>

      <z-tab label="Extrato">
        <div class="pt-6">
          @if (transactions.value()?.length) {
            <table z-table>
              <caption class="sr-only">Movimentações da carteira</caption>
              <thead z-table-header><tr z-table-row><th z-table-head>Data</th><th z-table-head>Descrição</th><th z-table-head class="text-right">Valor</th></tr></thead>
              <tbody z-table-body>
                @for (t of transactions.value(); track t.id) {
                  <tr z-table-row>
                    <td z-table-cell>{{ t.created_at | date: 'dd/MM/yyyy HH:mm' }}</td>
                    <td z-table-cell>{{ kindLabel[t.kind] }}@if (t.note) { <span class="text-muted-foreground"> · {{ t.note }}</span> }</td>
                    <td z-table-cell class="text-right font-semibold" [class]="t.amount > 0 ? 'text-primary' : 'text-destructive'">{{ t.amount > 0 ? '+' : '−' }}{{ abs(t.amount) }} h</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <z-empty zTitle="Sem movimentações" zDescription="Suas reservas, ganhos e resgates aparecem aqui." />
          }
        </div>
      </z-tab>

      <z-tab label="Comprovantes">
        <div class="pt-6">
          @if (redemptions.value()?.length) {
            <ul class="grid gap-3 md:grid-cols-2">
              @for (r of redemptions.value(); track r.id) {
                <li class="rounded-xl border p-4">
                  <p class="font-medium">{{ r.reward.title }}</p>
                  <p class="text-sm text-muted-foreground">{{ r.created_at | date: 'dd/MM/yyyy HH:mm' }} · {{ r.cost }} h</p>
                  <p class="mt-2 text-sm">Código de verificação</p>
                  <p class="font-mono text-xl font-bold tracking-widest">{{ r.verification_code }}</p>
                </li>
              }
            </ul>
          } @else {
            <z-empty zTitle="Nenhum resgate" zDescription="Os comprovantes auditáveis dos seus resgates ficam aqui." />
          }
        </div>
      </z-tab>
    </z-tab-group>

    <z-dialog [zVisible]="pending() !== null" (zVisibleChange)="!$event && pending.set(null)">
      <z-dialog-header>
        <z-dialog-title [zTitle]="'Resgatar ' + (pending()?.title ?? '')" />
        <z-dialog-description [zDescription]="'Serão debitadas ' + (pending()?.cost ?? 0) + ' horas da sua carteira. A operação gera um comprovante com código.'" />
      </z-dialog-header>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" (click)="pending.set(null)">Voltar</button>
        <button z-button type="button" [zLoading]="busy()" (click)="redeem()">Confirmar resgate</button>
      </z-dialog-footer>
    </z-dialog>
  `,
})
export class Wallet {
  protected readonly auth = inject(AuthStore);
  protected readonly org = inject(OrgStore);
  private readonly api = inject(WalletApi);
  private readonly sonner = inject(ZardSonnerService);

  protected readonly kindLabel = KIND_LABEL;
  protected readonly rewardKind = REWARD_KIND;
  protected readonly abs = Math.abs;

  protected readonly balance = computed(() => formatCredits(this.org.balance()));
  protected readonly pending = signal<Reward | null>(null);
  protected readonly busy = signal(false);

  protected readonly rewards = resource({ loader: () => this.api.rewards() });
  protected readonly transactions = resource({ loader: () => this.api.transactions() });
  protected readonly redemptions = resource({ loader: () => this.api.redemptions() });

  protected async redeem(): Promise<void> {
    const reward = this.pending();
    if (!reward) {
      return;
    }
    this.busy.set(true);
    try {
      const code = await this.api.redeem(reward.id);
      this.sonner.success(`Resgate concluído! Código: ${code}`);
      this.pending.set(null);
      await this.org.refresh();
      this.transactions.reload();
      this.redemptions.reload();
    } catch (err) {
      this.sonner.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
