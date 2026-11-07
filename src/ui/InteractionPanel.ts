/**
 * Right sidebar rectangle "Interaction" (Figma 347:6230).
 * One persistent rectangle (#panel-interaction) and one persistent "Interaction" heading
 * element whether folded (24px strip style with down arrow) or open (127px 18px bold header).
 * Subsections sit below the header inside this same rectangle and slide in as one block.
 * Overview / selection swap: whole segments slide (sectors vs back+legend), not each row.
 */
import { ARROW, h } from './dom';
import { createCityList } from './CityList';
import { createSectorFilter } from './SectorFilter';
import type { Component, UiContext } from './types';

function setInert(el: HTMLElement, inert: boolean): void {
  if (inert) el.setAttribute('inert', '');
  else el.removeAttribute('inert');
  el.setAttribute('aria-hidden', String(inert));
}

let settleListener: ((event: TransitionEvent) => void) | null = null;

/**
 * `is-settled` lets edge marks bleed past the border. It stays off while the
 * width is moving so the full-size content cannot spill out of the rectangle.
 */
function syncOpen(el: HTMLElement, open: boolean): void {
  const wasOpen = el.dataset.open === 'true';
  el.dataset.open = String(open);
  if (!open) {
    if (settleListener) {
      el.removeEventListener('transitionend', settleListener);
      settleListener = null;
    }
    el.classList.remove('is-settled');
    return;
  }
  // A later store update (hover, selection) must not settle the bleed mid-width.
  if (wasOpen) {
    if (!settleListener) el.classList.add('is-settled');
    return;
  }
  el.classList.remove('is-settled');
  if (settleListener) {
    el.removeEventListener('transitionend', settleListener);
    settleListener = null;
  }
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== el || event.propertyName !== 'width') return;
    el.removeEventListener('transitionend', onEnd);
    if (settleListener === onEnd) settleListener = null;
    if (el.dataset.open === 'true') el.classList.add('is-settled');
  };
  settleListener = onEnd;
  el.addEventListener('transitionend', onEnd);
  requestAnimationFrame(() => {
    if (settleListener !== onEnd) return;
    const ms = parseFloat(getComputedStyle(el).transitionDuration) * 1000;
    if (!(ms > 0)) {
      el.removeEventListener('transitionend', onEnd);
      settleListener = null;
      if (el.dataset.open === 'true') el.classList.add('is-settled');
    }
  });
}

/** Whole overview / selection segment: enter from above, leave downward, behind the city list. */
function setSwap(el: HTMLElement, visible: boolean, animate: boolean): void {
  if (visible) {
    el.classList.remove('is-out', 'is-gone');
    setInert(el, false);
    if (animate) {
      el.classList.add('is-enter');
      el.classList.remove('is-in');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.remove('is-enter');
          el.classList.add('is-in');
        });
      });
    } else {
      el.classList.remove('is-enter');
      el.classList.add('is-in');
    }
    return;
  }
  el.classList.remove('is-enter', 'is-in');
  el.classList.add('is-out');
  setInert(el, true);
  if (!animate) {
    el.classList.add('is-gone');
    return;
  }
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== el || event.propertyName !== 'transform') return;
    el.removeEventListener('transitionend', onEnd);
    if (el.classList.contains('is-out')) el.classList.add('is-gone');
  };
  el.addEventListener('transitionend', onEnd);
}

export function createInteractionPanel(ctx: UiContext): Component {
  const trigger = h('button', {
    class: 'panel-trigger',
    type: 'button',
    'aria-expanded': 'true',
    'aria-controls': 'panel-interaction-subsections',
    'aria-label': 'Open Interaction',
    'data-testid': 'open-interaction',
    onclick: () => ctx.actions.setSidebarPanel('interaction'),
  });

  const heading = h(
    'h2',
    { class: 'panel-header__title' },
    h('span', { class: 'panel-header__arrow', 'aria-hidden': 'true' }, `${ARROW.down} `),
    'Interaction',
  );
  const backToAll = h(
    'button',
    {
      class: 'panel-row',
      type: 'button',
      'data-testid': 'back-to-all',
      onclick: () => ctx.actions.clearSelection(),
    },
    `${ARROW.left} back to all`,
  );
  const legend = h(
    'button',
    {
      class: 'panel-row panel-toggle',
      type: 'button',
      'aria-pressed': 'false',
      'data-testid': 'legend-toggle',
      onclick: () => ctx.actions.toggleLegend(),
    },
    'Legend',
    h('span', { class: 'edge-mark edge-mark--ring', 'aria-hidden': 'true' }),
  );
  const sectors = createSectorFilter(ctx);
  const overviewSegment = h(
    'div',
    { class: 'panel-swap is-in', 'data-testid': 'overview-controls' },
    sectors.el,
  );
  const selectionSegment = h(
    'div',
    { class: 'panel-swap is-out is-gone', 'data-testid': 'selection-controls' },
    backToAll,
    legend,
  );
  const cities = createCityList(ctx);

  const subsections = h(
    'div',
    { class: 'panel-subsections', id: 'panel-interaction-subsections' },
    overviewSegment,
    selectionSegment,
    cities.el,
  );

  const content = h(
    'div',
    { class: 'panel-content' },
    h('header', { class: 'panel-header' }, heading),
    subsections,
  );

  const el = h(
    'div',
    {
      class: 'panel panel--interaction',
      id: 'panel-interaction',
      'data-testid': 'panel-interaction',
      'data-open': 'true',
    },
    trigger,
    content,
  );

  setInert(selectionSegment, true);

  return {
    el,
    update(state, previous) {
      const open = state.sidebar.panel === 'interaction';
      syncOpen(el, open);
      trigger.setAttribute('aria-expanded', String(open));
      setInert(trigger, open);
      setInert(subsections, !open);

      const inSelection = state.selection.length > 0;
      const wasSelection = previous ? previous.selection.length > 0 : inSelection;
      const animate = previous !== null && wasSelection !== inSelection && open;
      setSwap(overviewSegment, !inSelection, animate);
      setSwap(selectionSegment, inSelection, animate);
      legend.setAttribute('aria-pressed', String(inSelection && state.legendOpen));
      sectors.update(state, previous);
      cities.update(state, previous);
    },
  };
}
