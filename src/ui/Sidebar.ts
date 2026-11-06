/**
 * Explore sidebar (Figma 347:6230 / 288:10567): a horizontal accordion of two panels, 151px in total.
 *   Interaction open: [24px strip: title + mode, opens Info] [127px Interaction panel]
 *   Info open:        [127px Info panel] [24px strip: "Interaction", opens Interaction]
 * Two accordion sections side by side, each a strip followed by its panel: [info strip][Info]
 * [interaction strip][Interaction]. Opening one grows its panel out of its own strip while the
 * other collapses back into its strip. Closed parts stay mounted with inert.
 */
import type { AppState } from '../state/types';
import { ARROW, h } from './dom';
import { createInfoPanel } from './InfoPanel';
import { createInteractionPanel } from './InteractionPanel';
import type { Component, UiContext } from './types';

function modeLabel(state: AppState): string {
  if (state.selection.length === 0) return 'overview';
  return state.selection.length === 1 ? 'focus mode' : 'compare mode';
}

function setInert(el: HTMLElement, inert: boolean): void {
  if (inert) el.setAttribute('inert', '');
  else el.removeAttribute('inert');
  el.setAttribute('aria-hidden', String(inert));
}

export function createSidebar(ctx: UiContext): Component {
  const interaction = createInteractionPanel(ctx);
  const info = createInfoPanel(ctx);

  const mode = h('span', { class: 'sidebar-strip__mode', 'data-testid': 'strip-mode' });
  const toInfo = h(
    'button',
    {
      class: 'sidebar-strip',
      'aria-expanded': 'false',
      'aria-controls': 'panel-info',
      'aria-label': 'Open info',
      'data-testid': 'open-info',
      onclick: () => ctx.actions.setSidebarPanel('info'),
    },
    h('span', { class: 'sidebar-strip__title' }, 'HOW EUROPE WORKS'),
    mode,
  );
  const toInteraction = h(
    'button',
    {
      class: 'sidebar-strip sidebar-strip--end',
      'aria-expanded': 'false',
      'aria-controls': 'panel-interaction',
      'data-testid': 'open-interaction',
      onclick: () => ctx.actions.setSidebarPanel('interaction'),
    },
    h('span', { class: 'sidebar-strip__label' }, `${ARROW.down} Interaction`),
  );

  const el = h(
    'aside',
    { class: 'sidebar', 'data-testid': 'sidebar', 'aria-label': 'Controls' },
    toInfo,
    info.el,
    toInteraction,
    interaction.el,
  );

  return {
    el,
    update(state, previous) {
      el.hidden = state.scene !== 'explore';
      el.classList.toggle('sidebar--legend-locked', state.legendOpen);
      const infoOpen = state.sidebar.panel === 'info';
      el.dataset.panel = state.sidebar.panel;
      setInert(toInfo, infoOpen);
      setInert(toInteraction, !infoOpen);
      setInert(interaction.el, infoOpen);
      setInert(info.el, !infoOpen);
      toInfo.setAttribute('aria-expanded', String(infoOpen));
      toInteraction.setAttribute('aria-expanded', String(!infoOpen));
      mode.textContent = modeLabel(state);
      interaction.update(state, previous);
      info.update(state, previous);
    },
  };
}
