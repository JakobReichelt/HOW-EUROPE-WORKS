/**
 * Pure CSV -> Dataset transformation. No file IO here so it can be unit tested.
 * All source column names live in METRICS. Change a channel's indicator here only.
 */
import Papa from 'papaparse';
import { unemploymentLevel } from '../../src/config/encoding';
import {
  SCHEMA_VERSION,
  SECTOR_KEYS,
  type City,
  type Country,
  type Dataset,
  type SectorKey,
} from '../../src/data/types';

export const CITY_COLUMN = 'cities';

/** NACE Rev. 2 sections A-T. Their sum matches workplace jobs when that series is intact. */
const NACE_JOBS = {
  agriculture: 'clma_Employment (jobs) in agriculture, fishery (NACE Rev. 2, A)',
  industry: 'clma_Employment (jobs) in mining, manufacturing, energy (NACE Rev. 2, B-E)',
  construction: 'clma_Employment (jobs) in construction (NACE Rev. 2, F)',
  trade: 'clma_Employment (jobs) in trade, transport, hotels, restaurants (NACE Rev. 2, G to I)',
  information: 'clma_Employment (jobs) in information and communication (NACE Rev. 2, J)',
  finance: 'clma_Employment (jobs) in financial and insurance activities (NACE Rev. 2, K)',
  realEstate: 'clma_Employment (jobs) in real estate activities (NACE Rev. 2, L)',
  business:
    'clma_Employment (jobs) in professional, scientific and technical activities; administrative and support service activities (NACE Rev. 2, M and N)',
  public:
    'clma_Employment (jobs) in public administration, defence, education, human health and social work activities (NACE Rev. 2, O to Q)',
  other:
    'clma_Employment (jobs) in arts, entertainment and recreation; other service activities; activities of household and extra-territorial organizations and bodies (NACE Rev. 2, R to T)',
} as const;

export const METRICS = {
  workingPeople: 'clma_Economically active population, 20-64, total',
  workingPeopleFallback: 'clma_Persons employed, 20-64, total',
  workingPeopleMale: 'clma_Economically active population, 20-64, male',
  activeAllAgesMale: 'clma_Economically active population, male',
  activeAllAgesFemale: 'clma_Economically active population, female',
  commutersIn: 'ctran_People commuting into the city',
  totalJobs: 'clma_Total employment/jobs (workplace based)',
  unemploymentRate: 'clma_Unemployment rate',
  commuteMinutes: 'ctran_Average time of journey to work - minutes',
  naceJobs: NACE_JOBS,
  sectors: {
    public: NACE_JOBS.public,
    trade: NACE_JOBS.trade,
    business: NACE_JOBS.business,
    industry: NACE_JOBS.industry,
  } satisfies Record<SectorKey, string>,
} as const;

/**
 * Lisboa and Porto publish a 2023 jobs total about a third of the year before, while the
 * NACE columns stay on the old scale (Napoli, the next-widest gap, is 1.20).
 */
const JOBS_TOTAL_BREAK = 1.5;

/** Metric names that are reported in City.missing and in the coverage table. */
export const TRACKED_METRICS = [
  'workingPeople',
  'commuterRate',
  'maleShare',
  'unemploymentRate',
  'commuteMinutes',
  'biggestSector',
] as const satisfies readonly (keyof City)[];

export interface CityConfig {
  id: string;
  name: string;
  country: string;
}

export interface CountryConfig {
  name: string;
  geo: { lon: number; lat: number };
}

export interface DataConfig {
  countries: Record<string, CountryConfig>;
  cities: Record<string, CityConfig>;
}

export interface BuildResult {
  dataset: Dataset;
  warnings: string[];
}

export function parseNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function ratio(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return Math.min(1, Math.max(0, part / whole));
}

/** Share in 0-1. Above 1 means the two columns do not describe the same jobs, so the rate is missing. */
function shareAtMostOne(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0 || part < 0 || part > whole) return null;
  return part / whole;
}

function workplaceJobs(
  published: number | null,
  nace: readonly (number | null)[],
): { jobs: number | null; repaired: boolean } {
  let sectorSum = 0;
  for (const value of nace) {
    if (value === null) return { jobs: published, repaired: false };
    sectorSum += value;
  }
  if (published !== null && sectorSum > published * JOBS_TOTAL_BREAK) {
    return { jobs: sectorSum, repaired: true };
  }
  return { jobs: published, repaired: false };
}

function pickBiggestSector(sectors: Record<SectorKey, number | null>): SectorKey | null {
  let best: SectorKey | null = null;
  for (const key of SECTOR_KEYS) {
    const value = sectors[key];
    if (value === null) continue;
    if (best === null || value > (sectors[best] ?? -Infinity)) best = key;
  }
  return best;
}

function requiredColumns(): string[] {
  return [
    CITY_COLUMN,
    METRICS.workingPeople,
    METRICS.workingPeopleFallback,
    METRICS.workingPeopleMale,
    METRICS.activeAllAgesMale,
    METRICS.activeAllAgesFemale,
    METRICS.commutersIn,
    METRICS.totalJobs,
    METRICS.unemploymentRate,
    METRICS.commuteMinutes,
    ...Object.values(METRICS.naceJobs),
  ];
}

export function buildDataset(
  csvText: string,
  config: DataConfig,
  generatedAt: string = new Date().toISOString().slice(0, 10),
): BuildResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error: ${first?.message ?? 'unknown'} (row ${first?.row ?? '?'})`);
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const absent = requiredColumns().filter((c) => !fields.has(c));
  if (absent.length > 0) throw new Error(`CSV is missing columns:\n  ${absent.join('\n  ')}`);

  const warnings: string[] = [];
  const seen = new Set<string>();

  const cities: City[] = parsed.data.map((row) => {
    const rawName = row[CITY_COLUMN] ?? '';
    const cfg = config.cities[rawName];
    if (!cfg) throw new Error(`City "${rawName}" is not mapped in data/config/cities.json`);
    if (!config.countries[cfg.country]) {
      throw new Error(`City "${rawName}" uses unknown country "${cfg.country}"`);
    }
    seen.add(rawName);

    const num = (column: string) => parseNumber(row[column]);
    const activeTotal = num(METRICS.workingPeople);
    const activeMale = num(METRICS.activeAllAgesMale);
    const activeFemale = num(METRICS.activeAllAgesFemale);
    const activeAllAges =
      activeMale !== null && activeFemale !== null ? activeMale + activeFemale : null;
    const totalJobs = num(METRICS.totalJobs);
    const jobs = workplaceJobs(
      totalJobs,
      Object.values(METRICS.naceJobs).map((column) => num(column)),
    );
    if (jobs.repaired) {
      warnings.push(
        `${cfg.name}: published workplace jobs disagree with the NACE breakdown; commuter rate uses the sector sum.`,
      );
    }
    const unemploymentRate = num(METRICS.unemploymentRate);
    const sectors = Object.fromEntries(
      SECTOR_KEYS.map((key) => [key, num(METRICS.sectors[key])]),
    ) as Record<SectorKey, number | null>;

    const city: City = {
      id: cfg.id,
      name: cfg.name,
      country: cfg.country,
      workingPeople:
        activeTotal ?? num(METRICS.workingPeopleFallback) ?? activeAllAges ?? totalJobs,
      commuterRate: shareAtMostOne(num(METRICS.commutersIn), jobs.jobs),
      maleShare:
        ratio(num(METRICS.workingPeopleMale), activeTotal) ?? ratio(activeMale, activeAllAges),
      unemploymentRate,
      unemploymentLevel: unemploymentLevel(unemploymentRate),
      commuteMinutes: num(METRICS.commuteMinutes),
      sectors,
      biggestSector: pickBiggestSector(sectors),
      missing: [],
    };
    city.missing = TRACKED_METRICS.filter((m) => city[m] === null);
    return city;
  });

  for (const rawName of Object.keys(config.cities)) {
    if (!seen.has(rawName)) warnings.push(`cities.json lists "${rawName}" but the CSV does not.`);
  }

  const countries: Country[] = Object.entries(config.countries)
    .map(([id, c]) => {
      const own = cities
        .filter((city) => city.country === id)
        .sort((a, b) => (b.workingPeople ?? -1) - (a.workingPeople ?? -1));
      return {
        id,
        name: c.name,
        geo: c.geo,
        workingPeople: own.reduce((sum, city) => sum + (city.workingPeople ?? 0), 0),
        cityIds: own.map((city) => city.id),
      };
    })
    .filter((country) => {
      if (country.cityIds.length === 0) warnings.push(`Country ${country.id} has no cities.`);
      return country.cityIds.length > 0;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    dataset: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      source: 'Eurostat Urban Audit, data/raw/eurostat_european_cities.csv',
      countries,
      cities,
    },
    warnings,
  };
}

/** Plain-text table: one row per city, "x" = value present, "." = missing. */
export function coverageTable(dataset: Dataset): string {
  const header = ['city'.padEnd(14), 'ctry', ...TRACKED_METRICS.map((m) => m.slice(0, 10))];
  const lines = [header.join('  ')];
  for (const city of dataset.cities) {
    const cells = TRACKED_METRICS.map((m) =>
      (city.missing.includes(m) ? '.' : 'x').padEnd(Math.min(10, m.length)),
    );
    lines.push([city.id.padEnd(14), city.country.padEnd(4), ...cells].join('  '));
  }
  return lines.join('\n');
}
