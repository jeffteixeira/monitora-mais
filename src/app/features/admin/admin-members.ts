import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogImports } from '@/shared/components/dialog';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardTableImports } from '@/shared/components/table';

import { OrgApi } from '../../core/api/org.api';
import { StudentReviewsApi } from '../../core/api/student-reviews.api';
import { AuthStore } from '../../core/auth/auth.store';
import type { OrgMember, OrgRole } from '../../core/models';
import { OrgStore } from '../../core/org/org.store';
import { averageRating } from '../../core/util/format';
import { levelFor } from '../../core/util/level';
import { adminError } from './admin-util';

const ROLE_LABEL: Record<OrgRole, string> = { owner: 'Proprietário', admin: 'Administrador', member: 'Membro' };

@Component({
  selector: 'app-admin-members',
  imports: [RouterLink, ZardBadgeComponent, ZardButtonComponent, ZardDialogImports, ZardSelectImports, ZardTableImports],
  template: `
    <table z-table>
      <caption class="sr-only">Membros da organização</caption>
      <thead z-table-header>
        <tr z-table-row><th z-table-head>Membro</th><th z-table-head>Nível</th><th z-table-head>Reputação como aluno</th><th z-table-head>Papel</th><th z-table-head class="text-right">Ações</th></tr>
      </thead>
      <tbody z-table-body>
        @for (m of members.value() ?? []; track m.user_id) {
          <tr z-table-row>
            <td z-table-cell>
              <a [routerLink]="org.link('monitores', m.user_id)" class="underline-offset-4 hover:underline">{{ m.full_name }}</a>
              @if (m.user_id === uid()) { <z-badge zType="outline" class="ml-2">você</z-badge> }
            </td>
            <td z-table-cell>{{ level(m.xp) }}</td>
            <td z-table-cell>{{ reputationLabel(m.user_id) }}</td>
            <td z-table-cell>
              @if (isOwner() && m.user_id !== uid()) {
                <z-select class="w-44" [attr.aria-label]="'Papel de ' + m.full_name" [zValue]="m.role" (zSelectionChange)="changeRole(m, $event)">
                  <z-select-item zValue="member">Membro</z-select-item>
                  <z-select-item zValue="admin">Administrador</z-select-item>
                  <z-select-item zValue="owner">Proprietário</z-select-item>
                </z-select>
              } @else {
                {{ roleLabel[m.role] }}
              }
            </td>
            <td z-table-cell class="text-right">
              @if (canRemove(m)) {
                <button z-button zType="destructive" zSize="sm" type="button" (click)="target.set(m)">Remover</button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>

    <z-dialog [zVisible]="target() !== null" (zVisibleChange)="!$event && target.set(null)">
      <z-dialog-header>
        <z-dialog-title zTitle="Remover membro?" />
        <z-dialog-description [zDescription]="(target()?.full_name ?? '') + ' perde o acesso. Reservas e horários abertos dessa pessoa serão cancelados.'" />
      </z-dialog-header>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" (click)="target.set(null)">Voltar</button>
        <button z-button zType="destructive" type="button" [zLoading]="busy()" (click)="remove()">Remover</button>
      </z-dialog-footer>
    </z-dialog>
  `,
})
export class AdminMembers {
  protected readonly org = inject(OrgStore);
  private readonly api = inject(OrgApi);
  private readonly sonner = inject(ZardSonnerService);
  private readonly auth = inject(AuthStore);

  protected readonly roleLabel = ROLE_LABEL;
  protected readonly target = signal<OrgMember | null>(null);
  protected readonly busy = signal(false);
  protected readonly uid = computed(() => this.auth.user()?.id);
  protected readonly isOwner = computed(() => this.org.current()?.role === 'owner');
  protected readonly members = resource({ loader: () => this.api.members() });
  private readonly studentReviews = inject(StudentReviewsApi);
  private readonly reputations = resource({ loader: () => this.studentReviews.reputation() });
  private readonly reputationById = computed(
    () => new Map((this.reputations.value() ?? []).map((r) => [r.user_id, r])),
  );

  protected reputationLabel(userId: string): string {
    const r = this.reputationById().get(userId);
    const avg = r ? averageRating(r.rating_sum, r.rating_count) : null;
    return r && avg !== null ? `${avg} ★ (${r.rating_count})` : '—';
  }

  protected level(xp: number): number {
    return levelFor(xp).level;
  }

  protected canRemove(m: OrgMember): boolean {
    if (m.user_id === this.uid() || m.role === 'owner') {
      return false;
    }
    return m.role === 'member' || this.isOwner();
  }

  protected async changeRole(m: OrgMember, value: string | string[]): Promise<void> {
    const role = value as OrgRole;
    if (role === m.role) {
      return;
    }
    try {
      await this.api.setRole(m.user_id, role);
      this.sonner.success(`Papel de ${m.full_name} atualizado.`);
    } catch (err) {
      this.sonner.error(adminError(err));
    }
    this.members.reload();
  }

  protected async remove(): Promise<void> {
    const m = this.target();
    if (!m) {
      return;
    }
    this.busy.set(true);
    try {
      await this.api.removeMember(m.user_id);
      this.sonner.success(`${m.full_name} foi removido.`);
      this.target.set(null);
      this.members.reload();
    } catch (err) {
      this.sonner.error(adminError(err));
    } finally {
      this.busy.set(false);
    }
  }
}
