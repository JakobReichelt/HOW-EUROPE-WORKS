/** Minimal observable store. One instance per app, created in main.ts. */

export type Listener<S> = (state: S, previous: S) => void;

export interface Store<S> {
  getState(): S;
  /** Shallow-merges a patch (or the result of an updater) and notifies listeners if anything changed. */
  setState(patch: Partial<S> | ((state: S) => Partial<S>)): void;
  subscribe(listener: Listener<S>): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<Listener<S>>();

  return {
    getState: () => state,
    setState(patch) {
      const partial = typeof patch === 'function' ? patch(state) : patch;
      const keys = Object.keys(partial) as (keyof S)[];
      if (keys.every((k) => Object.is(partial[k], state[k]))) return;
      const previous = state;
      state = { ...state, ...partial };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
