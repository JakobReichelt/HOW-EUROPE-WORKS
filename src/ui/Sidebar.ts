/**
 * Explore sidebar (Figma 347:6230 / 288:10567): two accordion rectangles side by side, 151px total.
 *   Interaction open: [24px Info rectangle (folded)] [127px Interaction rectangle (open)]
 *   Info open:        [127px Info rectangle (open)]  [24px Interaction rectangle (folded)]
 * Clicking the folded rectangle expands that same rectangle in place and animates its
 * subsections from the bottom up, while the other rectangle folds down to 24px.
 */
import type { AppState } from '../state/types';
import { h, slideShow } from './dom';
import { createInfoPanel } from './InfoPanel';
import { createInteractionPanel } from './InteractionPanel';
import type { Component, UiContext } from './types';

function modeLabel(state: AppState): string {
  if (state.selection.length === 0) return 'overview';
  return state.selection.length === 1 ? 'focus mode' : 'compare mode';
}

export function createSidebar(ctx: UiContext): Component {
  const info = createInfoPanel(ctx);
  const interaction = createInteractionPanel(ctx);

  const el = h(
    'aside',
    {
      class: 'sidebar',
      'data-testid': 'sidebar',
      'aria-label': 'Controls',
      hidden: true,
    },
    info.el,
    interaction.el,
  );

  return {
    el,
    update(state, previous) {
      slideShow(el, state.scene === 'explore');
      el.classList.toggle('sidebar--legend-locked', state.legendOpen);
      el.dataset.panel = state.sidebar.panel;
      info.setModeLabel(modeLabel(state));
      info.update(state, previous);
      interaction.update(state, previous);
    },
  };
}
