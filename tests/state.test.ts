import { describe, expect, it, vi } from 'vitest';
import { INTRO_STEPS } from '../src/content/intro';
import { createActions } from '../src/state/actions';
import { hashToState, stateToHash, type RouteState } from '../src/state/router';
import { createStore } from '../src/state/store';
import { initialState } from '../src/state/types';

describe('store', () => {
  it('notifies only on real changes', () => {
    const store = createStore({ a: 1, b: 'x' });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ a: 1 });
    expect(listener).not.toHaveBeenCalled();
    store.setState({ a: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toEqual({ a: 2, b: 'x' });
  });
});

describe('actions', () => {
  it('walks through the intro into explore', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.startIntro();
    for (let i = 0; i < INTRO_STEPS.length - 1; i++) actions.introNext();
    expect(store.getState()).toMatchObject({ scene: 'intro', introStep: INTRO_STEPS.length - 1 });
    actions.introNext();
    expect(store.getState().scene).toBe('explore');
  });

  it('opens the map from the intro without a leftover selection', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.selectCountries(['FR']);
    actions.toggleLegend(true);
    actions.setIntroStep(INTRO_STEPS.length - 1);
    actions.introNext();
    expect(store.getState()).toMatchObject({
      scene: 'explore',
      introStep: INTRO_STEPS.length - 1,
      selection: [],
      legendOpen: false,
    });
  });

  it('skip intro opens explore the same way finishing the intro does', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.selectCountries(['FR']);
    actions.toggleLegend(true);
    actions.goToExplore();
    expect(store.getState()).toMatchObject({
      scene: 'explore',
      selection: [],
      legendOpen: false,
    });
  });

  it('toggles countries in selection order', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.toggleCountry('FR');
    actions.toggleCountry('ES');
    expect(store.getState().selection).toEqual([
      { kind: 'country', id: 'FR' },
      { kind: 'country', id: 'ES' },
    ]);
    actions.toggleCountry('FR');
    expect(store.getState().selection).toEqual([{ kind: 'country', id: 'ES' }]);
  });

  it('combines a country with cities from other countries', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    const france = ['paris', 'lyon', 'marseille'];
    actions.toggleCountry('FR', france);
    actions.toggleCity('berlin', 'DE');
    actions.toggleCity('napoli', 'IT');
    expect(store.getState().selection).toEqual([
      { kind: 'country', id: 'FR' },
      { kind: 'city', id: 'berlin' },
      { kind: 'city', id: 'napoli' },
    ]);
  });

  it('replaces a selected country with the city that was clicked', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.toggleCountry('FR', ['paris', 'lyon', 'marseille']);
    actions.toggleCity('berlin', 'DE');
    actions.toggleCity('paris', 'FR');
    expect(store.getState().selection).toEqual([
      { kind: 'city', id: 'berlin' },
      { kind: 'city', id: 'paris' },
    ]);
  });

  it('pans to a country or a city without leaving the overview', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.focusCountry('FR');
    expect(store.getState()).toMatchObject({
      selection: [],
      hover: { countryId: 'FR', cityId: null },
      viewFocus: { kind: 'country', id: 'FR', nonce: 1 },
    });
    actions.focusCity('paris', 'FR');
    expect(store.getState()).toMatchObject({
      selection: [],
      hover: { countryId: 'FR', cityId: 'paris' },
      viewFocus: { kind: 'city', id: 'paris', nonce: 2 },
    });
  });

  it('focuses a single city', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.selectCountries(['FR']);
    actions.selectCity('paris');
    expect(store.getState().selection).toEqual([{ kind: 'city', id: 'paris' }]);
  });

  it('combines a country with a city dropped onto it', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.selectCountryWithCity('DE', 'paris');
    expect(store.getState().selection).toEqual([
      { kind: 'country', id: 'DE' },
      { kind: 'city', id: 'paris' },
    ]);
  });

  it('leaves the combination in place when the view is focused', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.selectCountries(['ES']);
    actions.focusCountry('FR');
    expect(store.getState().selection).toEqual([{ kind: 'country', id: 'ES' }]);
    expect(store.getState().viewFocus).toMatchObject({ kind: 'country', id: 'FR' });
  });

  it('pins one sector and keeps it when that sector is clicked again', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.setSectorFilter('trade');
    actions.setSectorFilter('trade');
    expect(store.getState().sectorFilter).toBe('trade');
    actions.setSectorFilter('public');
    expect(store.getState().sectorFilter).toBe('public');
  });

  it('uses the sector heading to switch between all and none', () => {
    const store = createStore(initialState);
    const actions = createActions(store);
    actions.toggleAllSectors();
    expect(store.getState().sectorFilter).toBe('none');
    actions.toggleAllSectors();
    expect(store.getState().sectorFilter).toBeNull();
    actions.setSectorFilter('industry');
    actions.toggleAllSectors();
    expect(store.getState().sectorFilter).toBeNull();
  });
});

describe('router', () => {
  const cases: [RouteState, string][] = [
    [
      { scene: 'landing', introStep: 0, selection: [], sectorFilter: null, legendOpen: false },
      '#/',
    ],
    [
      { scene: 'intro', introStep: 2, selection: [], sectorFilter: null, legendOpen: false },
      '#/intro/3',
    ],
    [
      {
        scene: 'explore',
        introStep: 0,
        selection: [
          { kind: 'country', id: 'FR' },
          { kind: 'country', id: 'ES' },
        ],
        sectorFilter: 'trade',
        legendOpen: true,
      },
      '#/explore?sel=FR,ES&sector=trade&legend=1',
    ],
    [
      {
        scene: 'explore',
        introStep: 0,
        selection: [
          { kind: 'country', id: 'FR' },
          { kind: 'city', id: 'berlin' },
          { kind: 'city', id: 'napoli' },
        ],
        sectorFilter: null,
        legendOpen: false,
      },
      '#/explore?sel=FR,city.berlin,city.napoli',
    ],
    [
      {
        scene: 'explore',
        introStep: 0,
        selection: [],
        sectorFilter: 'none',
        legendOpen: false,
      },
      '#/explore?sector=none',
    ],
  ];

  it.each(cases)('round-trips %j', (state, hash) => {
    expect(stateToHash(state)).toBe(hash);
    expect(hashToState(hash)).toEqual(state);
  });

  it('ignores unknown sectors', () => {
    expect(hashToState('#/explore?sector=nope').sectorFilter).toBeNull();
  });
});
