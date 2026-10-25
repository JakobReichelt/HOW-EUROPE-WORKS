/** Narrow left strip with the vertical title during the intro (Figma 332:836). */
import { h } from './dom';
import type { Component } from './types';

export function createStrip(): Component {
  const el = h(
    'div',
    { class: 'sidebar-strip sidebar-strip--intro', 'aria-hidden': 'true' },
    h('span', { class: 'sidebar-strip__title' }, 'HOW EUROPE WORKS'),
    h('span', { class: 'sidebar-strip__mode' }, 'Intro'),
  );
  return {
    el,
    update(state) {
      el.hidden = state.scene !== 'intro';
    },
  };
}
