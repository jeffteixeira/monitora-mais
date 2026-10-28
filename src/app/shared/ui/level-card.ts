import { Component, computed, input } from '@angular/core';

import { ZardProgressComponent } from '@/shared/components/progress';

import { levelFor } from '../../core/util/level';

@Component({
  selector: 'app-level-card',
  imports: [ZardProgressComponent],
  template: `
    <div class="flex items-center gap-4">
      <div
        class="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary font-display text-2xl font-extrabold text-primary-foreground"
        aria-hidden="true"
      >
        {{ info().level }}
      </div>
      <div class="min-w-0 flex-1">
        <p class="font-display text-lg leading-tight font-bold">
          Nível {{ info().level }} · {{ info().title }}
        </p>
        <z-progress
          class="mt-2"
          [value]="info().percent"
          role="progressbar"
          [attr.aria-label]="'Progresso para o próximo nível'"
          [attr.aria-valuenow]="info().percent"
          aria-valuemin="0"
          aria-valuemax="100"
        />
        <p class="mt-1 text-xs text-muted-foreground">
          @if (info().needed > 0) {
            {{ info().current }} / {{ info().needed }} XP para o nível {{ info().level + 1 }}
          } @else {
            Nível máximo atingido
          }
        </p>
      </div>
    </div>
  `,
})
export class LevelCard {
  readonly xp = input.required<number>();
  protected readonly info = computed(() => levelFor(this.xp()));
}
