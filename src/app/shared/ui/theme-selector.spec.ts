import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ZardDarkMode } from '@/shared/services/dark-mode';

import { ThemeSelector } from './theme-selector';

describe('ThemeSelector', () => {
  const current = signal<'light' | 'dark' | 'system'>('system');
  const toggleTheme = vi.fn((mode: 'light' | 'dark' | 'system') => current.set(mode));

  beforeEach(() => {
    current.set('system');
    toggleTheme.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: ZardDarkMode, useValue: { currentTheme: current.asReadonly(), toggleTheme } }],
    });
  });

  const render = (variant: 'menu' | 'cards') => {
    const fixture = TestBed.createComponent(ThemeSelector);
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };
  const radios = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[role=radio]')];

  it('variante "menu": o botão informa o tema atual no rótulo acessível', () => {
    const { fixture, el } = render('menu');
    expect(el.querySelector('button')!.getAttribute('aria-label')).toBe('Tema: Sistema');

    current.set('dark');
    fixture.detectChanges();
    expect(el.querySelector('button')!.getAttribute('aria-label')).toBe('Tema: Escuro');
  });

  it('variante "cards": mostra as três opções e marca a ativa', () => {
    const { el } = render('cards');
    const options = radios(el);
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['Claro', 'Escuro', 'Sistema']);
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(options.map((o) => o.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('variante "cards": clicar escolhe o tema no serviço', () => {
    const { fixture, el } = render('cards');
    radios(el)[1].click();
    fixture.detectChanges();
    expect(toggleTheme).toHaveBeenCalledWith('dark');
    expect(radios(el)[1].getAttribute('aria-checked')).toBe('true');
  });

  it('variante "cards": as setas movem a escolha, circulando nas pontas', () => {
    const { el } = render('cards');
    const press = (index: number, key: string) =>
      radios(el)[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    press(2, 'ArrowRight'); // Sistema -> Claro
    expect(toggleTheme).toHaveBeenLastCalledWith('light');
    press(0, 'ArrowLeft'); // Claro -> Sistema
    expect(toggleTheme).toHaveBeenLastCalledWith('system');
    toggleTheme.mockClear();
    press(0, 'a');
    expect(toggleTheme).not.toHaveBeenCalled();
  });
});
