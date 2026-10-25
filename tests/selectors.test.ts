import { describe, expect, it } from 'vitest';
import { citiesByCountry, indexDataset } from '../src/data/selectors';
import type { Dataset } from '../src/data/types';
import { makeCity, makeCountry } from './fixtures';

const dataset: Dataset = {
  schemaVersion: 1,
  generatedAt: '',
  source: '',
  countries: [
    makeCountry({ id: 'DE', name: 'Germany', cityIds: ['berlin'] }),
    makeCountry({ id: 'FR', name: 'France', cityIds: ['paris', 'lyon'] }),
  ],
  cities: [
    makeCity({ id: 'lyon', name: 'Lyon', country: 'FR' }),
    makeCity({ id: 'paris', name: 'Paris', country: 'FR' }),
    makeCity({ id: 'berlin', name: 'Berlin', country: 'DE' }),
  ],
};

const index = indexDataset(dataset);

describe('citiesByCountry', () => {
  it('groups every city under its country, both alphabetical', () => {
    expect(
      citiesByCountry(index, '').map((g) => [g.country.id, g.cities.map((c) => c.id)]),
    ).toEqual([
      ['FR', ['lyon', 'paris']],
      ['DE', ['berlin']],
    ]);
  });

  it('hides the country heading when the query matches a city', () => {
    const groups = citiesByCountry(index, 'par');
    expect(groups.map((g) => g.cities.map((c) => c.id))).toEqual([['paris']]);
    expect(groups[0]?.showHeading).toBe(false);
  });

  it('includes every city of a country whose name matches', () => {
    const groups = citiesByCountry(index, 'germ');
    expect(groups.map((g) => g.country.id)).toEqual(['DE']);
    expect(groups[0]?.showHeading).toBe(true);
    expect(groups[0]?.cities.map((c) => c.id)).toEqual(['berlin']);
  });
});
