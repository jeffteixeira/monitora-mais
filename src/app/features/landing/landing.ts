import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAward,
  lucideCalendarCheck,
  lucideHeartHandshake,
  lucideRepeat,
  lucideShieldCheck,
  lucideTrendingUp,
  lucideTrophy,
} from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';

import { ThemeSelector } from '../../shared/ui/theme-selector';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, NgIcon, ThemeSelector, ZardButtonComponent],
  viewProviders: [
    provideIcons({ lucideAward, lucideCalendarCheck, lucideHeartHandshake, lucideRepeat, lucideShieldCheck, lucideTrendingUp, lucideTrophy }),
  ],
  template: `
    <header class="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
      <a routerLink="/" class="font-display text-xl font-extrabold">Monitora<span class="text-gold">+</span></a>
      <nav aria-label="Conta" class="flex items-center gap-2">
        <app-theme-selector />
        <a z-button zType="ghost" routerLink="/entrar">Entrar</a>
        <a z-button routerLink="/cadastro">Criar conta</a>
      </nav>
    </header>

    <main>
      <section class="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
        <div>
          <p class="mb-4 inline-flex rounded-full border bg-gold-soft px-3 py-1 text-sm font-semibold">
            Monitoria entre colegas · banco de tempo
          </p>
          <h1 class="font-display text-5xl leading-[1.02] font-extrabold text-balance sm:text-6xl">
            Cada hora que você ensina, volta para você.
          </h1>
          <p class="mt-6 max-w-xl text-lg text-muted-foreground">
            Dê monitoria, ganhe créditos de tempo e use para receber ajuda nas matérias difíceis — ou troque por horas complementares.
            Sem bolsa, sem burocracia.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <a z-button zSize="lg" routerLink="/cadastro">Começar com 5 horas grátis</a>
            <a z-button zSize="lg" zType="outline" href="#como-funciona">Como funciona</a>
          </div>
        </div>

        <figure class="relative mx-auto w-full max-w-sm" aria-label="Exemplo de carteira de tempo">
          <div class="rotate-2 rounded-3xl border bg-card p-6 shadow-xl">
            <p class="text-sm text-muted-foreground">Saldo disponível</p>
            <p class="font-display text-5xl font-extrabold">7,5 <span class="text-2xl text-muted-foreground">h</span></p>
            <ul class="mt-6 flex flex-col gap-3 text-sm">
              <li class="flex justify-between"><span>Cálculo I · monitoria</span><span class="font-semibold text-primary">+1,00 h</span></li>
              <li class="flex justify-between"><span>Física I · aula recebida</span><span class="font-semibold text-destructive">−1,50 h</span></li>
              <li class="flex justify-between"><span>Saldo de boas-vindas</span><span class="font-semibold text-primary">+5,00 h</span></li>
            </ul>
          </div>
          <div class="absolute -bottom-6 -left-4 -rotate-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg">
            <p class="text-xs opacity-80">Nível 5</p>
            <p class="font-display font-bold">Tutor Experiente</p>
          </div>
        </figure>
      </section>

      <section id="como-funciona" class="border-y bg-muted/40 py-20">
        <div class="mx-auto max-w-6xl px-4">
          <h2 class="font-display text-3xl font-extrabold sm:text-4xl">1 hora dada = 1 crédito recebido</h2>
          <ol class="mt-10 grid gap-6 md:grid-cols-3">
            @for (step of steps; track step.title) {
              <li class="rounded-2xl border bg-card p-6">
                <ng-icon [name]="step.icon" size="28" class="text-primary" aria-hidden="true" />
                <h3 class="mt-4 font-display text-xl font-bold">{{ step.title }}</h3>
                <p class="mt-2 text-muted-foreground">{{ step.text }}</p>
              </li>
            }
          </ol>
        </div>
      </section>

      <section class="mx-auto max-w-6xl px-4 py-20">
        <h2 class="font-display text-3xl font-extrabold sm:text-4xl">Gamificação que valoriza o trabalho invisível</h2>
        <div class="mt-10 grid gap-6 md:grid-cols-3">
          @for (item of game; track item.title) {
            <article class="rounded-2xl border p-6">
              <ng-icon [name]="item.icon" size="28" class="text-gold" aria-hidden="true" />
              <h3 class="mt-4 font-display text-xl font-bold">{{ item.title }}</h3>
              <p class="mt-2 text-muted-foreground">{{ item.text }}</p>
            </article>
          }
        </div>
      </section>

      <section class="bg-primary py-16 text-primary-foreground">
        <div class="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 md:flex-row md:items-center">
          <p class="max-w-2xl font-display text-3xl font-extrabold text-balance">
            Transforme o conhecimento do campus em uma economia colaborativa sustentável.
          </p>
          <a z-button zSize="lg" zType="secondary" routerLink="/cadastro">Criar minha conta</a>
        </div>
      </section>
    </main>

    <footer class="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
      Monitora+ · Projeto de TCC — monitoria acadêmica gamificada com banco de tempo.
    </footer>
  `,
})
export class Landing {
  protected readonly steps = [
    { icon: 'lucideCalendarCheck', title: 'Ofereça ou agende', text: 'Monitores publicam matérias e horários livres. Alunos buscam, comparam níveis e avaliações e reservam.' },
    { icon: 'lucideShieldCheck', title: 'Check-in com código', text: 'No horário, o monitor inicia a sessão e o aluno confirma presença com um código de 6 dígitos.' },
    { icon: 'lucideRepeat', title: 'Créditos automáticos', text: 'Ao encerrar, o monitor recebe as horas dadas e o aluno avalia com estrelas e elogios.' },
  ];

  protected readonly game = [
    { icon: 'lucideTrendingUp', title: 'Níveis e patentes', text: 'De Calouro da Monitoria a Mestre Acadêmico. No nível 5 você libera grupos maiores.' },
    { icon: 'lucideAward', title: 'Medalhas', text: 'Salvador de Vidas, Multidisciplinar, Madrugador e Pontualidade Britânica.' },
    { icon: 'lucideTrophy', title: 'Rankings', text: 'Horas doadas no mês e monitores mais bem avaliados, por curso, departamento ou campus.' },
  ];
}
