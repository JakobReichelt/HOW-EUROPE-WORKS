/** Number formatting as used in the Figma labels, e.g. 408'783 and 32%. */

const NO_DATA = 'no data';

export function formatInt(value: number | null): string {
  if (value === null) return NO_DATA;
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

export function formatPercent(share: number | null): string {
  if (share === null) return NO_DATA;
  return `${Math.round(share * 100)}%`;
}

export function formatRate(percent: number | null): string {
  if (percent === null) return NO_DATA;
  return `${Math.round(percent)}%`;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return NO_DATA;
  return `${Math.round(minutes)} min`;
}
