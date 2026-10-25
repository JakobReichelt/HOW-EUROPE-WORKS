/** Landing (Figma 393:13621): title, subtitle, start / skip intro. The background is drawn by p5. */
import { SUBTITLE, TITLE } from '../content/about';
import { ARROW, h, show } from './dom';
import type { Component, UiContext } from './types';

export function createLanding({ actions }: UiContext): Component {
  const [how, europe, works] = TITLE;
  const el = h(
    'section',
    { class: 'landing', 'data-testid': 'landing', 'aria-labelledby': 'landing-title' },
    h(
      'h1',
      { class: 'landing__title', id: 'landing-title' },
      h('span', { class: 'c-public' }, how),
      ' ',
      h('span', { class: 'c-trade' }, europe),
      ' ',
      h('span', { class: 'c-business' }, works),
    ),
    h('p', { class: 'landing__subtitle' }, SUBTITLE),
    h(
      'div',
      { class: 'landing__actions' },
      h(
        'button',
        { class: 'link', 'data-testid': 'start', onclick: () => actions.startIntro() },
        `start ${ARROW.right}`,
      ),
      h(
        'button',
        {
          class: 'link link--muted',
          'data-testid': 'skip-intro',
          onclick: () => actions.goToExplore(),
        },
        `skip intro ${ARROW.right}`,
      ),
    ),
  );

  return {
    el,
    update: (state) => show(el, state.scene === 'landing'),
  };
}
