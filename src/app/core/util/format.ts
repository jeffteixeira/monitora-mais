const dateTime = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const formatTime = (iso: string): string => time.format(new Date(iso));

export const hoursBetween = (startIso: string, endIso: string): number =>
  Math.round(((new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000) * 100) / 100;

export const formatCredits = (value: number): string =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)} h`;

export const averageRating = (sum: number, count: number): number | null =>
  count > 0 ? Math.round((sum / count) * 10) / 10 : null;
