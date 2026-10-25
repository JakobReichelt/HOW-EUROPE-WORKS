/**
 * City list with search. Countries head their cities. Clicking toggles that country or city
 * into the combined donut. A selected country does not mark its cities. Choosing a result
 * clears the search.
 */
import type { DataIndex } from '../data/selectors';
import { citiesByCountry, type CityGroup } from '../data/selectors';
import type { City, Country } from '../data/types';
import type { SelectionPart } from '../state/types';
import { h, setChildren } from './dom';
import type { Component, UiContext } from './types';

/** Latest selection index for this country, or -1 when nothing in it is selected. */
function selectionRank(
  data: DataIndex,
  selection: readonly SelectionPart[],
  countryId: string,
): number {
  let rank = -1;
  selection.forEach((part, index) => {
    const id = part.kind === 'country' ? part.id : data.cityById.get(part.id)?.country;
    if (id === countryId) rank = index;
  });
  return rank;
}

/** Selected countries first, newest selection at the top. The rest stay alphabetical. */
function promoteSelected(
  data: DataIndex,
  groups: CityGroup[],
  selection: readonly SelectionPart[],
): CityGroup[] {
  const picked: { group: CityGroup; rank: number }[] = [];
  const rest: CityGroup[] = [];
  for (const group of groups) {
    const rank = selectionRank(data, selection, group.country.id);
    if (rank >= 0) picked.push({ group, rank });
    else rest.push(group);
  }
  picked.sort((a, b) => b.rank - a.rank);
  return [...picked.map((item) => item.group), ...rest];
}

function sameSelection(a: readonly SelectionPart[], b: readonly SelectionPart[]): boolean {
  return (
    a.length === b.length && a.every((part, i) => part.kind === b[i]?.kind && part.id === b[i]?.id)
  );
}

export function createCityList({ data, actions }: UiContext): Component {
  const search = h('input', {
    class: 'country-search',
    type: 'search',
    placeholder: 'search',
    'aria-label': 'Search cities and countries',
    'data-testid': 'city-search',
  });
  search.addEventListener('input', () => actions.setCitySearch(search.value));

  const clear = h(
    'button',
    {
      class: 'clear-selection',
      'data-testid': 'clear-selection',
      hidden: true,
      onclick: () => actions.clearSelection(),
    },
    'remove all selections',
  );
  const list = h('ul', { class: 'country-list', 'data-testid': 'city-list' });
  const el = h(
    'section',
    { class: 'panel-section panel-section--grow', 'aria-label': 'Cities' },
    search,
    clear,
    list,
  );

  const choose = (apply: () => void) => {
    apply();
    if (search.value !== '') actions.setCitySearch('');
  };

  const cityItem = (city: City, isActive: boolean) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          class: `country city${isActive ? ' is-selected' : ''}`,
          'aria-pressed': String(isActive),
          'data-testid': `city-${city.id}`,
          onclick: () => choose(() => actions.toggleCity(city.id, city.country)),
        },
        city.name,
        h('span', { class: 'edge-mark edge-mark--dot', 'aria-hidden': 'true' }),
      ),
    );

  const countryItem = (
    country: Country,
    cities: City[],
    countries: Set<string>,
    picked: Set<string>,
  ) => {
    const countryActive = countries.has(country.id);
    return h(
      'li',
      { class: 'country-group' },
      h(
        'button',
        {
          class: `country country-heading${countryActive ? ' is-selected' : ''}`,
          'aria-pressed': String(countryActive),
          'data-testid': `country-${country.id}`,
          onclick: () => choose(() => actions.toggleCountry(country.id, country.cityIds)),
        },
        country.name,
        h('span', { class: 'edge-mark edge-mark--dot', 'aria-hidden': 'true' }),
      ),
      h(
        'ul',
        { class: 'country-group__cities', 'aria-label': `Cities in ${country.name}` },
        cities.map((city) => cityItem(city, picked.has(city.id))),
      ),
    );
  };

  return {
    el,
    update(state, previous) {
      clear.hidden = state.selection.length === 0;
      if (search.value !== state.sidebar.citySearch) search.value = state.sidebar.citySearch;
      if (
        previous &&
        previous.sidebar.citySearch === state.sidebar.citySearch &&
        sameSelection(previous.selection, state.selection)
      ) {
        return;
      }

      const countries = new Set(
        state.selection.filter((part) => part.kind === 'country').map((part) => part.id),
      );
      const picked = new Set(
        state.selection.filter((part) => part.kind === 'city').map((part) => part.id),
      );
      const groups = promoteSelected(
        data,
        citiesByCountry(data, state.sidebar.citySearch),
        state.selection,
      );
      const flatCities = groups
        .filter((group) => !group.showHeading)
        .flatMap((group) => group.cities)
        .sort((a, b) => a.name.localeCompare(b.name));
      setChildren(list, [
        ...groups
          .filter((group) => group.showHeading)
          .map((group) => countryItem(group.country, group.cities, countries, picked)),
        ...flatCities.map((city) => cityItem(city, picked.has(city.id))),
      ]);
    },
  };
}
