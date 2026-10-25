/** Bootstrap: data -> store -> router -> UI -> canvas -> dev API. */
import './styles/tokens.css';
import './styles/base.css';
import './styles/sidebar.css';
import { mountSketch } from './canvas/sketch';
import { theme } from './config/theme';
import { INTRO_STEPS } from './content/intro';
import { loadDataset } from './data/loadDataset';
import { indexDataset } from './data/selectors';
import { installDevApi } from './debug/devApi';
import { createActions } from './state/actions';
import { connectRouter } from './state/router';
import { createStore } from './state/store';
import { initialState } from './state/types';
import { mountUi } from './ui';

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing in index.html`);
  return el;
}

async function main() {
  const [dataset] = await Promise.all([
    loadDataset(),
    document.fonts.load(`16px "${theme.font.family}"`).catch(() => undefined),
  ]);
  const data = indexDataset(dataset);
  const store = createStore(initialState);
  connectRouter(store, {
    isKnownPart: (part) =>
      part.kind === 'country' ? data.countryById.has(part.id) : data.cityById.has(part.id),
    maxIntroStep: INTRO_STEPS.length - 1,
  });
  const actions = createActions(store);

  mountUi(element('ui-root'), store, { data, actions });
  const canvas = mountSketch(element('canvas-root'), { store, actions, data });
  installDevApi({ store, actions, data, canvas });
}

main().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`;
});
