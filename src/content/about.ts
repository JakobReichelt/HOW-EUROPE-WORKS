/** Copy for landing, info panel (Figma 288:10567) and legend (360:6643). */

export const TITLE = ['HOW', 'EUROPE', 'WORKS'] as const;
export const SUBTITLE = 'aspects of work in European cities';

export const ABOUT_PROJECT =
  'HOW EUROPE WORKS shows aspects of work in European cities: how many people work there, ' +
  'how many commute, how long the way to work takes and how high unemployment is.';

export const ABOUT_DATA =
  'Source: Eurostat Urban Audit (city statistics). Cities without a value for a metric are ' +
  'drawn without that channel. See docs/data-dictionary.md for the exact indicators.';

export const LEGEND = {
  commute: (minutes: number) => `${minutes} min way to work`,
  /** Where a segment sits when that metric is missing. */
  noData: 'no data',
};
