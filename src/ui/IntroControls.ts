/** Intro copy and back / next (Figma 415:1295 ... 419:2812). The chart is drawn by p5. */
import { introFrame } from '../config/introFrame';
import { theme } from '../config/theme';
import {
  INTRO_CITY_ID,
  INTRO_COUNTRY_ID,
  INTRO_STEPS,
  fillTemplate,
  type IntroBlock,
  type IntroRun,
} from '../content/intro';
import { ARROW, h, setChildren, show } from './dom';
import type { Component, UiContext } from './types';

export function createIntroControls({ data, actions }: UiContext): Component {
  const city = data.cityById.get(INTRO_CITY_ID);
  const country = data.countryById.get(INTRO_COUNTRY_ID);
  const vars = { city: city?.name ?? INTRO_CITY_ID, country: country?.name ?? INTRO_COUNTRY_ID };
  const nav = theme.intro.nav;
  const frameRight = theme.layout.design.width - (theme.intro.box.x + theme.intro.box.w);

  const copy = h('div', { class: 'intro__copy', 'data-testid': 'intro-lead' });
  const backLabel = h('span', {}, 'back');
  const nextLabel = h('span', { class: 'intro__next-label' });
  const back = h(
    'button',
    {
      class: 'intro__back',
      'data-testid': 'intro-back',
      onclick: () => actions.introBack(),
    },
    h('span', { class: 'intro__arrow', 'aria-hidden': 'true' }, ARROW.left),
    backLabel,
  );
  const next = h(
    'button',
    {
      class: 'intro__next',
      'data-testid': 'intro-next',
      onclick: () => actions.introNext(),
    },
    h('span', { class: 'intro__arrow', 'aria-hidden': 'true' }, ARROW.right),
    nextLabel,
  );
  const stage = h('div', { class: 'intro__stage' }, copy, back, next);
  const el = h('section', { class: 'intro', 'data-testid': 'intro', 'aria-live': 'polite' }, stage);

  const place = () => {
    const frame = introFrame(window.innerWidth, window.innerHeight);
    stage.style.transform = `translate(${frame.ox}px, ${frame.oy}px) scale(${frame.scale})`;
  };
  place();
  window.addEventListener('resize', place);

  back.style.left = `${nav.back.x}px`;
  back.style.top = `${nav.back.y}px`;

  return {
    el,
    update(state) {
      show(el, state.scene === 'intro');
      const step = INTRO_STEPS[state.introStep];
      if (!step) return;
      setChildren(
        copy,
        step.blocks.map((block) => renderBlock(block, vars)),
      );
      show(back, step.showBack);
      nextLabel.textContent = step.nextLabel;
      next.classList.toggle('intro__next--beside', step.nextBeside);
      if (step.nextBeside) {
        next.style.left = `${nav.explore.x}px`;
        next.style.right = 'auto';
        next.style.top = `${nav.explore.y}px`;
      } else {
        next.style.left = 'auto';
        next.style.right = `${frameRight}px`;
        next.style.top = `${nav.next.y}px`;
      }
    },
  };
}

function renderBlock(block: IntroBlock, vars: { city: string; country: string }): HTMLElement {
  return h(
    'div',
    {
      class: 'intro__block',
      style: `left:${block.x}px;top:${block.y}px;width:${block.width}px`,
    },
    ...block.lines.map((runs) =>
      h('p', { class: 'intro__line' }, ...runs.map((run) => renderRun(run, vars))),
    ),
  );
}

function renderRun(run: IntroRun, vars: { city: string; country: string }): HTMLElement {
  return h(
    'span',
    { class: run.weight ? `intro__run intro__run--${run.weight}` : 'intro__run' },
    fillTemplate(run.text, vars),
  );
}
