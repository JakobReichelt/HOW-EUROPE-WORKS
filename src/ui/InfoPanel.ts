/** Sidebar panel "Info" (Figma 288:10567): title, back to intro, about the project, about the data. */
import { ABOUT_DATA, ABOUT_PROJECT, TITLE } from '../content/about';
import type { InfoSection } from '../state/types';
import { ARROW, h } from './dom';
import type { Component, UiContext } from './types';

export function createInfoPanel({ actions }: UiContext): Component {
  const sections: { id: InfoSection; title: string; body: string }[] = [
    { id: 'about', title: 'About this Project', body: ABOUT_PROJECT },
    { id: 'data', title: 'About the Data', body: ABOUT_DATA },
  ];

  const parts = sections.map((s) => {
    const body = h('p', { class: 'accordion__body' }, s.body);
    const panel = h(
      'div',
      { class: 'accordion__panel', id: `info-${s.id}` },
      h('div', { class: 'accordion__panel-inner' }, body),
    );
    const toggle = h(
      'button',
      {
        class: 'panel-row accordion__toggle',
        'aria-expanded': 'false',
        'aria-controls': `info-${s.id}`,
        'data-testid': `info-${s.id}`,
        onclick: () => actions.toggleInfoSection(s.id),
      },
      s.title,
    );
    return {
      id: s.id,
      toggle,
      panel,
      el: h('section', { class: 'panel-section' }, toggle, panel),
    };
  });

  const el = h(
    'div',
    { class: 'panel', id: 'panel-info', 'data-testid': 'panel-info' },
    h(
      'header',
      { class: 'panel-header panel-header--title' },
      h(
        'h2',
        { class: 'panel-header__big' },
        TITLE.map((line) => h('span', {}, line)),
      ),
    ),
    h(
      'button',
      {
        class: 'panel-row',
        'data-testid': 'back-to-intro',
        onclick: () => actions.startIntro(),
      },
      `${ARROW.left} Back to the Introduction`,
    ),
    parts.map((p) => p.el),
  );

  return {
    el,
    update(state) {
      for (const part of parts) {
        const open = state.sidebar.openInfo === part.id;
        part.toggle.setAttribute('aria-expanded', String(open));
        part.panel.dataset.open = open ? 'true' : 'false';
        if (open) part.panel.removeAttribute('inert');
        else part.panel.setAttribute('inert', '');
      }
    },
  };
}
