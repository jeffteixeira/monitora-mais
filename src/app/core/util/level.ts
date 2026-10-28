export const XP_PER_LEVEL = 200;
export const MAX_LEVEL = 10;

const TITLES: Record<number, string> = {
  1: 'Calouro da Monitoria',
  5: 'Tutor Experiente',
  10: 'Mestre Acadêmico',
};

export interface LevelInfo {
  level: number;
  title: string;
  /** XP acumulado dentro do nível atual */
  current: number;
  /** XP necessário para o próximo nível (0 no nível máximo) */
  needed: number;
  percent: number;
}

export function levelFor(xp: number): LevelInfo {
  const level = Math.min(MAX_LEVEL, 1 + Math.floor(Math.max(xp, 0) / XP_PER_LEVEL));
  const maxed = level === MAX_LEVEL;
  const current = maxed ? XP_PER_LEVEL : xp % XP_PER_LEVEL;
  const title = TITLES[Object.keys(TITLES).map(Number).filter((l) => l <= level).pop() ?? 1];
  return {
    level,
    title,
    current,
    needed: maxed ? 0 : XP_PER_LEVEL,
    percent: maxed ? 100 : Math.round((current / XP_PER_LEVEL) * 100),
  };
}
