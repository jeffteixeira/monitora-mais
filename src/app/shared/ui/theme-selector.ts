import { Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMonitor, lucideMoon, lucideSun } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDropdownImports } from '@/shared/components/dropdown';
import { type DarkModeOptions, EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';

interface ThemeOption {
  value: DarkModeOptions;
  label: string;
  hint: string;
  icon: string;
}

const OPTIONS: ThemeOption[] = [
  { value: EDarkModes.LIGHT, label: 'Claro', hint: 'Fundo claro, bom para ambientes iluminados.', icon: 'lucideSun' },
  { value: EDarkModes.DARK, label: 'Escuro', hint: 'Menos brilho, mais confortável à noite.', icon: 'lucideMoon' },
  { value: EDarkModes.SYSTEM, label: 'Sistema', hint: 'Acompanha o tema do seu aparelho.', icon: 'lucideMonitor' },
];

/** Escolha de tema: `menu` (ícone com menu, para cabeçalhos) ou `cards` (opções visíveis, para o perfil). */
@Component({
  selector: 'app-theme-selector',
  imports: [NgIcon, ZardButtonComponent, ZardDropdownImports],
  viewProviders: [provideIcons({ lucideMonitor, lucideMoon, lucideSun })],
  template: `
    @if (variant() === 'menu') {
      <button
        z-button
        zType="ghost"
        zSize="icon"
        type="button"
        z-dropdown
        [zDropdownMenu]="menu"
        [attr.aria-label]="'Tema: ' + selected().label"
      >
        <ng-icon [name]="selected().icon" aria-hidden="true" />
      </button>
      <z-dropdown-menu-content #menu="zDropdownMenuContent" zAlign="end" class="w-44">
        <z-dropdown-menu-radio-group [zValue]="current()" (zValueChange)="select($event)" aria-label="Tema">
          @for (o of options; track o.value) {
            <z-dropdown-menu-radio-item [zValue]="o.value">{{ o.label }}</z-dropdown-menu-radio-item>
          }
        </z-dropdown-menu-radio-group>
      </z-dropdown-menu-content>
    } @else {
      <div role="radiogroup" aria-label="Tema do aplicativo" class="grid gap-3 sm:grid-cols-3">
        @for (o of options; track o.value; let i = $index) {
          <button
            type="button"
            role="radio"
            class="flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            [class]="current() === o.value ? 'border-primary bg-accent' : ''"
            [attr.aria-label]="o.label"
            [attr.aria-describedby]="'theme-hint-' + o.value"
            [attr.aria-checked]="current() === o.value"
            [attr.tabindex]="current() === o.value ? 0 : -1"
            (click)="select(o.value)"
            (keydown)="onKey($event, i)"
          >
            <ng-icon [name]="o.icon" size="22" aria-hidden="true" />
            <span class="font-medium">{{ o.label }}</span>
            <span class="text-xs text-muted-foreground" [id]="'theme-hint-' + o.value">{{ o.hint }}</span>
          </button>
        }
      </div>
    }
  `,
})
export class ThemeSelector {
  readonly variant = input<'menu' | 'cards'>('menu');

  private readonly darkMode = inject(ZardDarkMode);
  protected readonly options = OPTIONS;
  protected readonly current = this.darkMode.currentTheme;
  protected readonly selected = computed(
    () => OPTIONS.find((o) => o.value === this.current()) ?? OPTIONS[2],
  );

  protected select(value: string | undefined): void {
    const option = OPTIONS.find((o) => o.value === value);
    if (option) {
      this.darkMode.toggleTheme(option.value);
    }
  }

  /** Setas movem a seleção, como em qualquer grupo de opções (radiogroup). */
  protected onKey(event: KeyboardEvent, index: number): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
    this.select(next.value);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLElement>('[role=radio]')
      [OPTIONS.indexOf(next)]?.focus();
  }
}
