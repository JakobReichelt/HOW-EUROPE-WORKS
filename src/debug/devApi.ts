/**
 * window.__HEW__: a stable handle for agents, tests and the browser console.
 *   __HEW__.state()                      current AppState
 *   __HEW__.actions.selectCountries(['FR','ES'])
 *   __HEW__.canvas.inspect()             layout / camera of the active scene
 *   __HEW__.canvas.hitAt(x, y)           what is under a canvas pixel (explore)
 *   __HEW__.city('zurich')               one city record
 */
import type { CanvasHandle } from '../canvas/sketch';
import type { DataIndex } from '../data/selectors';
import type { Actions } from '../state/actions';
import type { Store } from '../state/store';
import type { AppState } from '../state/types';

export interface DevApi {
  version: string;
  state(): AppState;
  actions: Actions;
  data: DataIndex;
  city(id: string): unknown;
  country(id: string): unknown;
  canvas: CanvasHandle;
}

declare global {
  interface Window {
    __HEW__?: DevApi;
  }
}

export function installDevApi(deps: {
  store: Store<AppState>;
  actions: Actions;
  data: DataIndex;
  canvas: CanvasHandle;
}): DevApi {
  const api: DevApi = {
    version: '0.1.0',
    state: () => deps.store.getState(),
    actions: deps.actions,
    data: deps.data,
    city: (id) => deps.data.cityById.get(id) ?? null,
    country: (id) => deps.data.countryById.get(id) ?? null,
    canvas: deps.canvas,
  };
  window.__HEW__ = api;
  return api;
}
