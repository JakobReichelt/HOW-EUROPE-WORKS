/**
 * "Biggest Economic Sectors" (Figma 347:6230, 393:8528).
 * All on: every sector shows its colour dot. Clicking one leaves only that sector on.
 * The heading selects all, or none, from whatever is on now.
 */
import { SECTORS } from '../config/encoding';
import { SECTOR_KEYS } from '../data/types';
import { h } from './dom';
import type { Component, UiContext } from './types';

export function createSectorFilter({ actions }: UiContext): Component {
  const buttons = SECTOR_KEYS.map((key) =>
    h(
      'button',
      {
        class: 'sector',
        type: 'button',
        'data-testid': `sector-${key}`,
        'data-sector': key,
        'aria-pressed': 'true',
        onclick: () => actions.setSectorFilter(key),
      },
      SECTORS[key].label,
      h('span', { class: `edge-mark edge-mark--dot c-bg-${key}`, 'aria-hidden': 'true' }),
    ),
  );
  const title = h(
    'button',
    {
      class: 'panel-section__title sector-all',
      id: 'sectors-title',
      type: 'button',
      'aria-pressed': 'true',
      'data-testid': 'sectors-all',
      onclick: () => actions.toggleAllSectors(),
    },
    'Biggest Economic Sectors',
    h('span', { class: 'edge-mark edge-mark--sectors', 'aria-hidden': 'true' }),
  );
  const el = h(
    'section',
    { class: 'panel-section', 'aria-labelledby': 'sectors-title' },
    title,
    h('div', { class: 'sector-list' }, buttons),
  );

  return {
    el,
    update(state) {
      const all = state.sectorFilter === null;
      title.setAttribute('aria-pressed', String(all));
      title.classList.toggle('is-dimmed', state.sectorFilter === 'none');
      SECTOR_KEYS.forEach((key, i) => {
        const button = buttons[i];
        if (!button) return;
        const selected = state.sectorFilter === key;
        const on = all || selected;
        button.setAttribute('aria-pressed', String(on));
        button.classList.toggle('is-only', selected);
        button.classList.toggle('is-dimmed', !on);
      });
    },
  };
}
