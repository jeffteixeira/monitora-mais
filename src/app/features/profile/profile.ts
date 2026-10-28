import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAward, lucideCheck, lucideCopy, lucideLock } from '@ng-icons/lucide';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardDialogImports } from '@/shared/components/dialog';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardTextareaComponent } from '@/shared/components/textarea';

import { CatalogApi } from '../../core/api/catalog.api';
import { GamificationApi } from '../../core/api/gamification.api';
import { OrgApi } from '../../core/api/org.api';
import { StudentReviewsApi } from '../../core/api/student-reviews.api';
import { errorMessage, unwrap } from '../../core/api/unwrap';
import { AuthStore } from '../../core/auth/auth.store';
import { OrgStore } from '../../core/org/org.store';
import { PwaService } from '../../core/pwa/pwa.service';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { averageRating, formatDateTime } from '../../core/util/format';
import { LevelCard } from '../../shared/ui/level-card';
import { Stars } from '../../shared/ui/stars';

@Component({
  selector: 'app-profile',
  imports: [NgIcon, LevelCard, Stars, ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardDialogImports, ZardFieldImports, ZardInputComponent, ZardSelectImports, ZardTextareaComponent],
  viewProviders: [provideIcons({ lucideAward, lucideCheck, lucideCopy, lucideLock })],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Meu perfil</h1>
    <p class="mt-1 text-muted-foreground">Em <strong>{{ org.current()?.org?.name }}</strong></p>

    <div class="mt-6 grid gap-4 lg:grid-cols-2">
      <z-card>
        <z-card-header><z-card-title zTitle="Progresso nesta organização" /></z-card-header>
        <z-card-content class="flex flex-col gap-3">
          <app-level-card [xp]="org.current()?.xp ?? 0" />
          <p class="text-sm text-muted-foreground">Nível 5 libera grupos maiores · Nível 10 concede o selo de Mestre Acadêmico.</p>
        </z-card-content>
      </z-card>

      <z-card>
        <z-card-header><z-card-title zTitle="Dados" /></z-card-header>
        <z-card-content>
          <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
            <z-field-group>
              <div z-field>
                <label z-field-label for="name">Nome completo</label>
                <input z-input id="name" required minlength="2" [value]="fullName()" (input)="fullName.set($any($event.target).value)" />
              </div>
              <div z-field>
                <label z-field-label for="course">Curso nesta organização</label>
                <z-select id="course" zPlaceholder="Selecione" [(zValue)]="courseId">
                  @for (c of courses.value() ?? []; track c.id) { <z-select-item [zValue]="c.id">{{ c.name }}</z-select-item> }
                </z-select>
              </div>
              <div z-field>
                <label z-field-label for="bio">Sobre você</label>
                <textarea z-textarea id="bio" rows="3" maxlength="500" [value]="bio()" (input)="bio.set($any($event.target).value)"></textarea>
              </div>
            </z-field-group>
            <button z-button type="submit" [zLoading]="busy()">Salvar alterações</button>
          </form>
        </z-card-content>
      </z-card>
    </div>

    <h2 class="mt-10 font-display text-2xl font-bold">Medalhas</h2>
    <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      @for (b of badges(); track b.code) {
        <li class="rounded-xl border p-4" [class]="b.earned ? 'bg-gold-soft' : 'text-muted-foreground'">
          <ng-icon [name]="b.earned ? 'lucideAward' : 'lucideLock'" size="24" aria-hidden="true" />
          <p class="mt-2 font-display font-bold">{{ b.name }}</p>
          <p class="text-sm">{{ b.description }}</p>
          <p class="sr-only">{{ b.earned ? 'Conquistada' : 'Bloqueada' }}</p>
        </li>
      }
    </ul>

    <h2 class="mt-10 font-display text-2xl font-bold">Avaliações que recebi</h2>
    <p class="mt-1 text-sm text-muted-foreground">Feedback dos monitores sobre sua participação. Só você e os administradores da organização veem.</p>
    @if (reputation(); as rep) {
      <p class="mt-3 flex items-center gap-2 font-display text-xl font-bold">
        <app-stars [value]="rep.avg" /> {{ rep.avg }}
        <span class="text-sm font-normal text-muted-foreground">({{ rep.count }} {{ rep.count === 1 ? 'avaliação' : 'avaliações' }})</span>
      </p>
      <ul class="mt-4 grid gap-3 md:grid-cols-2">
        @for (r of received.value() ?? []; track r.id) {
          <li class="rounded-xl border p-4">
            <div class="flex items-center justify-between gap-2">
              <app-stars [value]="r.rating" />
              <time class="text-xs text-muted-foreground" [attr.datetime]="r.created_at">{{ date(r.created_at) }}</time>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">{{ r.subject_name }} · {{ r.monitor_name }}</p>
            @if (r.tags.length) {
              <p class="mt-2 flex flex-wrap gap-1.5">@for (t of r.tags; track t) { <z-badge zType="outline">{{ t }}</z-badge> }</p>
            }
            @if (r.comment) { <p class="mt-2 text-sm">{{ r.comment }}</p> }
          </li>
        }
      </ul>
    } @else {
      <p class="mt-3 text-sm text-muted-foreground">Você ainda não recebeu avaliações de monitores.</p>
    }

    @if (pwa.canInstall() || pwa.showIosHint()) {
      <h2 class="mt-10 font-display text-2xl font-bold">Instalar o app</h2>
      <z-card class="mt-4">
        <z-card-content class="flex flex-wrap items-center gap-3">
          @if (pwa.canInstall()) {
            <p class="text-sm text-muted-foreground">Abra o Monitora+ direto da tela inicial, em tela cheia.</p>
            <button z-button type="button" (click)="pwa.install()">Instalar app</button>
          } @else {
            <p class="text-sm text-muted-foreground">No iPhone ou iPad: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
          }
        </z-card-content>
      </z-card>
    }

    <h2 class="mt-10 font-display text-2xl font-bold">Convidar colegas</h2>
    <z-card class="mt-4">
      <z-card-content class="flex flex-wrap items-center gap-3">
        <code class="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{{ inviteLink() }}</code>
        <button z-button zType="outline" type="button" (click)="copyInvite()">
          <ng-icon [name]="copied() ? 'lucideCheck' : 'lucideCopy'" aria-hidden="true" />{{ copied() ? 'Copiado' : 'Copiar link' }}
        </button>
      </z-card-content>
    </z-card>

    <h2 class="mt-10 font-display text-2xl font-bold">Conta</h2>
    <button z-button zType="outline" class="mt-3" type="button" (click)="signOut()">Sair da conta</button>

    <h2 class="mt-10 font-display text-2xl font-bold">Zona de saída</h2>
    <p class="mt-1 text-sm text-muted-foreground">Sair desta organização cancela suas reservas e horários abertos (os créditos reservados voltam). Seu histórico é mantido se você voltar.</p>
    <button z-button zType="destructive" class="mt-3" type="button" (click)="leaveOpen.set(true)">Sair da organização</button>

    <z-dialog [(zVisible)]="leaveOpen">
      <z-dialog-header>
        <z-dialog-title zTitle="Sair da organização?" />
        <z-dialog-description [zDescription]="'Você deixará ' + (org.current()?.org?.name ?? '') + '. Reservas e monitorias abertas serão canceladas.'" />
      </z-dialog-header>
      <z-dialog-footer>
        <button z-button zType="outline" type="button" (click)="leaveOpen.set(false)">Voltar</button>
        <button z-button zType="destructive" type="button" [zLoading]="busy()" (click)="leave()">Sair</button>
      </z-dialog-footer>
    </z-dialog>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthStore);
  protected readonly org = inject(OrgStore);
  protected readonly pwa = inject(PwaService);
  private readonly client = inject(SupabaseService).client;
  private readonly catalog = inject(CatalogApi);
  private readonly orgApi = inject(OrgApi);
  private readonly gamification = inject(GamificationApi);
  private readonly studentReviews = inject(StudentReviewsApi);
  private readonly sonner = inject(ZardSonnerService);
  private readonly router = inject(Router);

  protected readonly courses = resource({ loader: () => this.catalog.courses() });
  private readonly allBadges = resource({ loader: () => this.gamification.badges() });
  private readonly earned = resource({
    params: () => this.auth.user()?.id,
    loader: ({ params }) => this.gamification.earnedBadgeCodes(params),
  });

  protected readonly received = resource({
    params: () => this.auth.user()?.id,
    loader: ({ params }) => this.studentReviews.received(params),
  });
  private readonly myReputation = resource({
    params: () => this.auth.user()?.id,
    loader: async ({ params }) => (await this.studentReviews.reputation([params]))[0] ?? null,
  });
  protected readonly reputation = computed(() => {
    const r = this.myReputation.value();
    const avg = r ? averageRating(r.rating_sum, r.rating_count) : null;
    return r && avg !== null ? { avg, count: r.rating_count } : null;
  });
  protected readonly date = formatDateTime;

  protected readonly fullName = signal('');
  protected readonly bio = signal('');
  protected readonly courseId = signal<string | string[]>('');
  protected readonly busy = signal(false);
  protected readonly leaveOpen = signal(false);
  protected readonly copied = signal(false);

  protected readonly badges = computed(() => {
    const codes = new Set(this.earned.value() ?? []);
    return (this.allBadges.value() ?? []).map((b) => ({ ...b, earned: codes.has(b.code) }));
  });
  protected readonly inviteLink = computed(() =>
    this.org.inviteUrl(this.org.current()?.org.invite_code ?? ''),
  );

  constructor() {
    effect(() => {
      const p = this.auth.profile();
      if (p) {
        this.fullName.set(p.full_name);
        this.bio.set(p.bio ?? '');
      }
    });
    effect(() => this.courseId.set(this.org.current()?.course_id ?? ''));
  }

  protected async save(): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid) {
      return;
    }
    this.busy.set(true);
    try {
      const course = this.courseId();
      unwrap(
        await this.client
          .from('profiles')
          .update({ full_name: this.fullName().trim(), bio: this.bio().trim() || null })
          .eq('id', uid),
      );
      await this.orgApi.setMyCourse(typeof course === 'string' && course ? course : null);
      await Promise.all([this.auth.refreshProfile(), this.org.refresh()]);
      this.sonner.success('Perfil atualizado.');
    } catch (err) {
      this.sonner.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.org.clear();
    await this.router.navigateByUrl('/');
  }

  protected async copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.inviteLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.sonner.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  protected async leave(): Promise<void> {
    const id = this.org.currentId();
    if (!id) {
      return;
    }
    this.busy.set(true);
    try {
      await this.orgApi.leave(id);
      this.leaveOpen.set(false);
      await this.org.refresh();
      this.sonner.success('Você saiu da organização.');
      await this.router.navigateByUrl('/organizacoes');
    } catch (err) {
      this.sonner.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
