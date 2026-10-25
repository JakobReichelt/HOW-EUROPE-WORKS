/** Read-only lookups on a Dataset. Build an index once and pass it around. */
import type { City, Country, Dataset } from './types';

export interface DataIndex {
  dataset: Dataset;
  countries: Country[];
  countryById: Map<string, Country>;
  cityById: Map<string, City>;
}

export function indexDataset(dataset: Dataset): DataIndex {
  return {
    dataset,
    countries: dataset.countries,
    countryById: new Map(dataset.countries.map((c) => [c.id, c])),
    cityById: new Map(dataset.cities.map((c) => [c.id, c])),
  };
}

export function citiesOf(index: DataIndex, countryId: string): City[] {
  const country = index.countryById.get(countryId);
  if (!country) return [];
  return country.cityIds.flatMap((id) => index.cityById.get(id) ?? []);
}

export function searchCountries(index: DataIndex, query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.countries;
  return index.countries.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase() === q,
  );
}

export function searchCities(index: DataIndex, query: string): City[] {
  const q = query.trim().toLowerCase();
  const all = [...index.dataset.cities].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return all;
  return all.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (index.countryById.get(c.country)?.name.toLowerCase().includes(q) ?? false),
  );
}

export interface CityGroup {
  country: Country;
  cities: City[];
  /** Country name is shown when the query is empty or matches the country itself. */
  showHeading: boolean;
}

function queryMatchesCountry(country: Country, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return country.name.toLowerCase().includes(q) || country.id.toLowerCase() === q;
}

/** Cities matching `query`, grouped under their country. Both levels are alphabetical. */
export function citiesByCountry(index: DataIndex, query: string): CityGroup[] {
  const buckets = new Map<string, City[]>();
  for (const city of searchCities(index, query)) {
    const bucket = buckets.get(city.country);
    if (bucket) bucket.push(city);
    else buckets.set(city.country, [city]);
  }
  const groups: CityGroup[] = [];
  for (const [id, cities] of buckets) {
    const country = index.countryById.get(id);
    if (country) groups.push({ country, cities, showHeading: queryMatchesCountry(country, query) });
  }
  groups.sort((a, b) => a.country.name.localeCompare(b.country.name));
  return groups;
}
