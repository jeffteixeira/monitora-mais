import { describe, expect, it } from 'vitest';

import { levelFor } from './level';

describe('levelFor', () => {
  it('começa no nível 1 como Calouro da Monitoria', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Calouro da Monitoria', percent: 0 });
  });

  it('sobe 1 nível a cada 200 XP e calcula o progresso', () => {
    expect(levelFor(500)).toMatchObject({ level: 3, current: 100, needed: 200, percent: 50 });
  });

  it('libera Tutor Experiente no nível 5', () => {
    expect(levelFor(800).title).toBe('Tutor Experiente');
  });

  it('limita no nível 10 (Mestre Acadêmico)', () => {
    expect(levelFor(99_999)).toMatchObject({ level: 10, title: 'Mestre Acadêmico', needed: 0, percent: 100 });
  });
});
