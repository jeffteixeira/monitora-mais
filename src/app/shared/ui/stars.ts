import { Component, computed, input, model } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideStar } from '@ng-icons/lucide';

/** Estrelas de 1 a 5: somente leitura ou, com `editable`, um radiogroup acessível. */
@Component({
  selector: 'app-stars',
  imports: [NgIcon],
  viewProviders: [provideIcons({ lucideStar })],
  template: `
    @if (editable()) {
      <div role="radiogroup" [attr.aria-label]="label()" class="flex gap-1">
        @for (n of range; track n) {
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="value() === n"
            [attr.aria-label]="n + (n === 1 ? ' estrela' : ' estrelas')"
            class="rounded-md p-1 transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            [class]="n <= value() ? 'text-gold [&_svg]:fill-current' : 'text-muted-foreground/50'"
            (click)="value.set(n)"
          >
            <ng-icon name="lucideStar" size="28" aria-hidden="true" />
          </button>
        }
      </div>
    } @else {
      <span class="inline-flex items-center gap-0.5" role="img" [attr.aria-label]="description()">
        @for (n of range; track n) {
          <ng-icon
            name="lucideStar"
            size="14"
            aria-hidden="true"
            [class]="n <= rounded() ? 'text-gold [&_svg]:fill-current' : 'text-muted-foreground/40'"
          />
        }
      </span>
    }
  `,
})
export class Stars {
  readonly value = model(0);
  readonly editable = input(false);
  readonly label = input('Nota');

  protected readonly range = [1, 2, 3, 4, 5];
  protected readonly rounded = computed(() => Math.round(this.value()));
  protected readonly description = computed(() =>
    this.value() > 0 ? `Nota ${this.value().toString().replace('.', ',')} de 5` : 'Sem avaliações',
  );
}
