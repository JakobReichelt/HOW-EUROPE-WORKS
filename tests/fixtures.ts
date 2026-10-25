import type { City, Country } from '../src/data/types';

export function makeCity(overrides: Partial<City> & { id: string }): City {
  return {
    name: overrides.id,
    country: 'XX',
    workingPeople: 100,
    commuterRate: 0.3,
    maleShare: 0.5,
    unemploymentRate: 5,
    unemploymentLevel: 'low',
    commuteMinutes: 30,
    sectors: { public: 1, trade: 0, business: 0, industry: 0 },
    biggestSector: 'public',
    missing: [],
    ...overrides,
  };
}

export function makeCountry(overrides: Partial<Country> & { id: string }): Country {
  return {
    name: overrides.id,
    geo: { lon: 10, lat: 48 },
    workingPeople: 1_000_000,
    cityIds: [],
    ...overrides,
  };
}

/** Zurich, Geneva, Basel with the values from the dataset (rounded). */
export const swissCities: City[] = [
  makeCity({ id: 'zurich', country: 'CH', workingPeople: 408783, commuteMinutes: 39.9 }),
  makeCity({
    id: 'geneva',
    country: 'CH',
    workingPeople: 192367,
    commuteMinutes: 36.1,
    unemploymentLevel: 'high',
  }),
  makeCity({ id: 'basel', country: 'CH', workingPeople: 171556, commuteMinutes: 33.1 }),
];
