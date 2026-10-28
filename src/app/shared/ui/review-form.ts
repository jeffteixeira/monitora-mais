import { Component, input, output, signal } from '@angular/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardTextareaComponent } from '@/shared/components/textarea';

import { Stars } from './stars';

export interface ReviewValue {
  rating: number;
  tags: string[];
  comment: string;
}

let nextId = 0;

/** Formulário de avaliação (estrelas, elogios e comentário), usado nos dois sentidos: aluno↔monitor. */
@Component({
  selector: 'app-review-form',
  imports: [Stars, ZardButtonComponent, ZardFieldImports, ZardTextareaComponent],
  template: `
    <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()">
      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium">{{ question() }}</legend>
        <app-stars [(value)]="rating" [editable]="true" [label]="starsLabel()" />
      </fieldset>
      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium">Elogios (opcional)</legend>
        <div class="flex flex-wrap gap-2">
          @for (tag of tags(); track tag) {
            <button z-button type="button" zSize="sm" [zType]="chosen().includes(tag) ? 'default' : 'outline'" [attr.aria-pressed]="chosen().includes(tag)" (click)="toggle(tag)">{{ tag }}</button>
          }
        </div>
      </fieldset>
      <div z-field>
        <label z-field-label [for]="commentId">Comentário (opcional)</label>
        <textarea z-textarea [id]="commentId" rows="3" maxlength="500" (input)="comment.set($any($event.target).value)"></textarea>
      </div>
      <button z-button type="submit" [zLoading]="busy()" [zDisabled]="rating() === 0">{{ submitLabel() }}</button>
    </form>
  `,
})
export class ReviewForm {
  readonly tags = input.required<string[]>();
  readonly question = input('Como foi a monitoria?');
  readonly starsLabel = input('Nota');
  readonly submitLabel = input('Enviar avaliação');
  readonly busy = input(false);
  readonly submitted = output<ReviewValue>();

  protected readonly commentId = `review-comment-${nextId++}`;
  protected readonly rating = signal(0);
  protected readonly chosen = signal<string[]>([]);
  protected readonly comment = signal('');

  protected toggle(tag: string): void {
    this.chosen.update((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  protected submit(): void {
    if (this.rating() === 0) {
      return;
    }
    this.submitted.emit({
      rating: this.rating(),
      tags: this.chosen(),
      comment: this.comment().trim(),
    });
  }
}
