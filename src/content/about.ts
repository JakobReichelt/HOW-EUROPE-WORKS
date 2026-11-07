/** Copy for landing, info panel (Figma 288:10567) and legend (360:6643). */

export const TITLE = ['HOW', 'EUROPE', 'WORKS'] as const;
export const SUBTITLE = 'aspects of work in European cities';

export const ABOUT_PROJECT =
  'HOW EUROPE WORKS grew out of the Think 3 module (BA Data Design + Art, HSLU): a Eurostat ' +
  'dataset on work in European cities was analysed with Python, sketched by hand, then ' +
  'prototyped in Figma into this exploratory interface. Jakob Reichelt, 15.09.\u201309.10.2026.';

/** Official Eurostat Cities database (City statistics / Urban Audit tables urb_*). */
export const DATA_SOURCE_URL = 'https://ec.europa.eu/eurostat/web/cities/database';
export const DATA_SOURCE_LABEL = 'Eurostat City statistics';

export const ABOUT_DATA =
  '(Urban Audit / cities and greater cities): 48 cities in 17 countries. This app uses ' +
  'labour-market and transport indicators: working people, unemployment, NACE sector jobs, ' +
  'commute time and inbound commuters. Reporting is voluntary, so coverage is uneven; cities ' +
  'without a value omit that channel.';

export const LEGEND = {
  commute: (minutes: number) => `${minutes} min way to work`,
  /** Where a segment sits when that metric is missing. */
  noData: 'no data',
};
