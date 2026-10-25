/** Full-screen click catcher while the explore legend is open. */
import { h } from './dom';
import type { Component, UiContext } from './types';

export function createLegendShield(ctx: UiContext): Component {
  const el = h('button', {
    type: 'button',
    class: 'legend-shield',
    hidden: true,
    'data-testid': 'legend-shield',
    'aria-label': 'Close legend',
    onclick: () => ctx.actions.toggleLegend(false),
  });
  el.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  return {
    el,
    update(state) {
      el.hidden = state.scene !== 'explore' || !state.legendOpen;
    },
  };
}
