/**
 * Selection is an ordered list of countries and cities that share one donut.
 * A country part stands for every city of that country. Those cities are not selected on
 * their own. Picking one of them replaces the country with that city.
 */
import type { SelectionPart } from './types';

const CITY_PREFIX = 'city.';

export function encodeSelection(selection: readonly SelectionPart[]): string {
  return selection
    .map((part) => (part.kind === 'city' ? `${CITY_PREFIX}${part.id}` : part.id))
    .join(',');
}

export function decodeSelection(value: string): SelectionPart[] {
  return value
    .split(',')
    .filter(Boolean)
    .flatMap((token): SelectionPart[] => {
      if (token.startsWith(CITY_PREFIX)) {
        const id = token.slice(CITY_PREFIX.length);
        return id ? [{ kind: 'city', id }] : [];
      }
      return [{ kind: 'country', id: token }];
    });
}

function hasCountry(selection: readonly SelectionPart[], countryId: string): boolean {
  return selection.some((part) => part.kind === 'country' && part.id === countryId);
}

function withoutCities(
  selection: readonly SelectionPart[],
  cityIds: readonly string[],
): SelectionPart[] {
  const ids = new Set(cityIds);
  return selection.filter((part) => part.kind !== 'city' || !ids.has(part.id));
}

/** Add the country, or remove it. Cities of that country are absorbed into the country part. */
export function toggleCountryPart(
  selection: readonly SelectionPart[],
  countryId: string,
  cityIds: readonly string[],
): SelectionPart[] {
  if (hasCountry(selection, countryId)) {
    return selection.filter((part) => !(part.kind === 'country' && part.id === countryId));
  }
  return [...withoutCities(selection, cityIds), { kind: 'country', id: countryId }];
}

/** Add the city, or remove it. A city inside a selected country replaces that country. */
export function toggleCityPart(
  selection: readonly SelectionPart[],
  cityId: string,
  countryId: string,
): SelectionPart[] {
  if (hasCountry(selection, countryId)) {
    const rest = selection.filter((part) => !(part.kind === 'country' && part.id === countryId));
    return [...rest, { kind: 'city', id: cityId }];
  }
  if (selection.some((part) => part.kind === 'city' && part.id === cityId)) {
    return selection.filter((part) => !(part.kind === 'city' && part.id === cityId));
  }
  return [...selection, { kind: 'city', id: cityId }];
}
