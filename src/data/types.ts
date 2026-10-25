/**
 * Shared data types for the build script (scripts/) and the app (src/).
 * Changing these is a schema change: bump SCHEMA_VERSION and rerun `npm run data`.
 */

export const SCHEMA_VERSION = 1 as const;

export const SECTOR_KEYS = ['public', 'trade', 'business', 'industry'] as const;
export type SectorKey = (typeof SECTOR_KEYS)[number];

export type Level3 = 'low' | 'medium' | 'high';

export interface City {
  /** Slug, e.g. "zurich". */
  id: string;
  /** Display name, e.g. "Zurich". */
  name: string;
  /** Country id (ISO alpha-2, "UK" for the United Kingdom), e.g. "CH". */
  country: string;
  workingPeople: number | null;
  /** Share of jobs filled by people commuting into the city, 0-1. */
  commuterRate: number | null;
  /** Share of men in the economically active population 20-64, 0-1. */
  maleShare: number | null;
  /** Unemployment rate in percent. */
  unemploymentRate: number | null;
  unemploymentLevel: Level3 | null;
  /** Average journey to work in minutes. Continuous; drives the radial offset of the segment. */
  commuteMinutes: number | null;
  sectors: Record<SectorKey, number | null>;
  biggestSector: SectorKey | null;
  /** Names of the metrics above that are missing for this city. */
  missing: string[];
}

export interface Country {
  id: string;
  name: string;
  /** Approximate geographic centre, used to seed the world layout. */
  geo: { lon: number; lat: number };
  /** Sum of workingPeople over all cities of the country. */
  workingPeople: number;
  /** Sorted descending by workingPeople; cities without workingPeople come last. */
  cityIds: string[];
}

export interface Dataset {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  source: string;
  countries: Country[];
  cities: City[];
}
