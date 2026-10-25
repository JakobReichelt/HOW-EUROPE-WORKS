/** Mounts all DOM UI into #ui-root and keeps it in sync with the store. */
import type { Store } from '../state/store';
import type { AppState } from '../state/types';
import { createIntroControls } from './IntroControls';
import { createLanding } from './Landing';
import { createLegendShield } from './LegendShield';
import { createSidebar } from './Sidebar';
import { createStrip } from './Strip';
import type { UiContext } from './types';

export function mountUi(root: HTMLElement, store: Store<AppState>, ctx: UiContext): () => void {
  const components = [
    createLanding(ctx),
    createStrip(),
    createIntroControls(ctx),
    createSidebar(ctx),
    createLegendShield(ctx),
  ];
  root.replaceChildren(...components.map((c) => c.el));

  const update = (state: AppState, previous: AppState | null) => {
    for (const c of components) c.update(state, previous);
  };
  update(store.getState(), null);
  return store.subscribe(update);
}
