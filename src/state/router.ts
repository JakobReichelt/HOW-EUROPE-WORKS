/**
 * Hash routing so every view is linkable and reproducible:
 *   #/                                  landing
 *   #/intro/3                           intro step 3 (1-based in the URL)
 *   #/explore?sel=FR,ES&sector=trade&legend=1
 *   #/explore?sector=none
 *   #/explore?sel=FR,city.berlin,city.napoli
 */
import { SECTOR_KEYS, type SectorKey } from '../data/types';
import { decodeSelection, encodeSelection } from './selection';
import type { Store } from './store';
import type { AppState, SectorFilter, SelectionPart } from './types';

export type RouteState = Pick<
  AppState,
  'scene' | 'introStep' | 'selection' | 'sectorFilter' | 'legendOpen'
>;

export function stateToHash(state: RouteState): string {
  if (state.scene === 'landing') return '#/';
  if (state.scene === 'intro') return `#/intro/${state.introStep + 1}`;
  const params = new URLSearchParams();
  if (state.selection.length > 0) params.set('sel', encodeSelection(state.selection));
  if (state.sectorFilter) params.set('sector', state.sectorFilter);
  if (state.legendOpen) params.set('legend', '1');
  const query = params.toString().replace(/%2C/g, ',');
  return query ? `#/explore?${query}` : '#/explore';
}

export function hashToState(hash: string): RouteState {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const base: RouteState = {
    scene: 'landing',
    introStep: 0,
    selection: [],
    sectorFilter: null,
    legendOpen: false,
  };

  if (parts[0] === 'intro') {
    const step = Number.parseInt(parts[1] ?? '1', 10);
    return {
      ...base,
      scene: 'intro',
      introStep: Number.isFinite(step) ? Math.max(0, step - 1) : 0,
    };
  }
  if (parts[0] === 'explore') {
    const params = new URLSearchParams(query);
    return {
      ...base,
      scene: 'explore',
      selection: decodeSelection(params.get('sel') ?? ''),
      sectorFilter: sectorFromParam(params.get('sector')),
      legendOpen: params.get('legend') === '1',
    };
  }
  return base;
}

function sectorFromParam(value: string | null): SectorFilter {
  if (value === 'none') return 'none';
  return SECTOR_KEYS.includes(value as SectorKey) ? (value as SectorKey) : null;
}

/**
 * Two-way sync between store and location.hash.
 * `isKnownPart` drops unknown countries and cities from the URL; `maxIntroStep` clamps the step.
 */
export function connectRouter(
  store: Store<AppState>,
  options: { isKnownPart: (part: SelectionPart) => boolean; maxIntroStep: number },
): () => void {
  const applyHash = () => {
    const route = hashToState(window.location.hash);
    store.setState({
      ...route,
      introStep: Math.min(route.introStep, options.maxIntroStep),
      selection: route.selection.filter(options.isKnownPart),
    });
  };

  applyHash();
  window.addEventListener('hashchange', applyHash);

  const unsubscribe = store.subscribe((state) => {
    const hash = stateToHash(state);
    if (hash !== window.location.hash && !(hash === '#/' && window.location.hash === '')) {
      history.replaceState(null, '', hash);
    }
  });

  return () => {
    window.removeEventListener('hashchange', applyHash);
    unsubscribe();
  };
}
