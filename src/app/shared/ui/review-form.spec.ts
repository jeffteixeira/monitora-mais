import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { type ReviewValue, ReviewForm } from './review-form';

describe('ReviewForm', () => {
  const setup = () => {
    const fixture = TestBed.createComponent(ReviewForm);
    fixture.componentRef.setInput('tags', ['Pontual', 'Respeitoso']);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const emitted: ReviewValue[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    return { fixture, el, emitted };
  };

  it('só habilita o envio depois de escolher uma nota', async () => {
    const { fixture, el } = setup();
    const submit = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(submit.disabled).toBe(true);

    el.querySelector<HTMLButtonElement>('button[role=radio][aria-label="4 estrelas"]')!.click();
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
  });

  it('emite nota, elogios escolhidos e comentário sem espaços nas pontas', () => {
    const { fixture, el, emitted } = setup();
    el.querySelector<HTMLButtonElement>('button[role=radio][aria-label="5 estrelas"]')!.click();
    fixture.detectChanges();

    const tagButtons = [...el.querySelectorAll<HTMLButtonElement>('fieldset button[aria-pressed]')].filter(
      (b) => b.textContent?.trim() === 'Respeitoso',
    );
    tagButtons[0].click();
    fixture.detectChanges();
    expect(tagButtons[0].getAttribute('aria-pressed')).toBe('true');

    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '  Participou bastante  ';
    textarea.dispatchEvent(new Event('input'));

    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(emitted).toEqual([{ rating: 5, tags: ['Respeitoso'], comment: 'Participou bastante' }]);
  });

  it('não emite sem nota', () => {
    const { el, emitted } = setup();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(emitted).toEqual([]);
  });
});
