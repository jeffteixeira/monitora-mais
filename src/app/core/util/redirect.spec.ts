import { describe, expect, it } from 'vitest';

import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('aceita caminhos internos', () => {
    expect(safeRedirect('/convite/ABC123')).toBe('/convite/ABC123');
    expect(safeRedirect('/o/piloto/inicio?x=1')).toBe('/o/piloto/inicio?x=1');
  });

  it('recusa URLs externas e valores vazios', () => {
    expect(safeRedirect('https://evil.test')).toBeNull();
    expect(safeRedirect('//evil.test')).toBeNull();
    expect(safeRedirect('/\\evil.test')).toBeNull();
    expect(safeRedirect('')).toBeNull();
    expect(safeRedirect(undefined)).toBeNull();
  });
});
