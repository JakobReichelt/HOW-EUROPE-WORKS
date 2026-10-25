/** Landing (Figma 393:13621): title, subtitle, start / skip intro. Background is drawn by p5. */
import { introFrame } from '../config/introFrame';
import { theme } from '../config/theme';
import { SUBTITLE, TITLE } from '../content/about';
import { ARROW, h, show } from './dom';
import type { Component, UiContext } from './types';

export function createLanding({ actions }: UiContext): Component {
  const [how, europe, works] = TITLE;
  const L = theme.landing;

  const title = h(
    'h1',
    { class: 'landing__title', id: 'landing-title' },
    h('span', { class: 'c-public' }, how),
    h('span', { class: 'c-trade' }, europe),
    h('span', { class: 'c-business' }, works),
  );
  title.style.left = `${L.title.x}px`;
  title.style.top = `${L.title.y}px`;
  title.style.width = `${L.title.w}px`;

  const subtitle = h('p', { class: 'landing__subtitle' }, SUBTITLE);
  subtitle.style.left = `${L.subtitle.x}px`;
  subtitle.style.top = `${L.subtitle.y}px`;

  const start = h(
    'button',
    { class: 'landing__link', 'data-testid': 'start', onclick: () => actions.startIntro() },
    h('span', { class: 'landing__link-label' }, 'start'),
    h('span', { class: 'landing__link-arrow', 'aria-hidden': 'true' }, ARROW.right),
  );
  start.style.left = `${L.start.x}px`;
  start.style.top = `${L.start.y}px`;

  const skip = h(
    'button',
    {
      class: 'landing__link landing__link--muted',
      'data-testid': 'skip-intro',
      onclick: () => actions.goToExplore(),
    },
    h('span', { class: 'landing__link-label' }, 'skip intro'),
    h('span', { class: 'landing__link-arrow', 'aria-hidden': 'true' }, ARROW.right),
  );
  skip.style.left = `${L.skip.x}px`;
  skip.style.top = `${L.skip.y}px`;

  const stage = h('div', { class: 'landing__stage' }, title, subtitle, start, skip);
  const el = h(
    'section',
    { class: 'landing', 'data-testid': 'landing', 'aria-labelledby': 'landing-title' },
    stage,
  );

  const place = () => {
    const frame = introFrame(window.innerWidth, window.innerHeight);
    stage.style.transform = `translate(${frame.ox}px, ${frame.oy}px) scale(${frame.scale})`;
  };
  place();
  window.addEventListener('resize', place);

  return {
    el,
    update: (state) => show(el, state.scene === 'landing'),
  };
}
