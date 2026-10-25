import type { DataIndex } from '../data/selectors';
import type { Actions } from '../state/actions';
import type { AppState } from '../state/types';

export interface UiContext {
  data: DataIndex;
  actions: Actions;
}

/** A UI component builds its element once and updates it on every state change. */
export interface Component {
  el: HTMLElement;
  update(state: AppState, previous: AppState | null): void;
}
