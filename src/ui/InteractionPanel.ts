/** Sidebar panel "Interaction" (Figma 347:6230): header, legend toggle, sectors, countries. */
import { h } from './dom';
import { createCityList } from './CityList';
import { createSectorFilter } from './SectorFilter';
import type { Component, UiContext } from './types';

export function createInteractionPanel(ctx: UiContext): Component {
  const heading = h('h2', { class: 'panel-header__title' }, 'Interaction');
  const legend = h(
    'button',
    {
      class: 'panel-row panel-toggle',
      'aria-pressed': 'false',
      'data-testid': 'legend-toggle',
      onclick: () => ctx.actions.toggleLegend(),
    },
    'Legend',
    h('span', { class: 'edge-mark edge-mark--ring', 'aria-hidden': 'true' }),
  );
  const sectors = createSectorFilter(ctx);
  const cities = createCityList(ctx);
  const el = h(
    'div',
    { class: 'panel', id: 'panel-interaction', 'data-testid': 'panel-interaction' },
    h('header', { class: 'panel-header' }, heading),
    legend,
    sectors.el,
    cities.el,
  );

  return {
    el,
    update(state, previous) {
      el.hidden = state.sidebar.panel !== 'interaction';
      legend.setAttribute('aria-pressed', String(state.legendOpen));
      sectors.update(state, previous);
      cities.update(state, previous);
    },
  };
}
