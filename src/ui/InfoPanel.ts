/**
 * Left sidebar rectangle "Info" (Figma 288:10567).
 * One persistent rectangle (#panel-info) and one persistent "HOW EUROPE WORKS" heading
 * element whether folded (24px strip style) or open (127px 3-line 38px header style).
 * Subsections sit below the header inside this same rectangle and animate from the bottom up.
 */
import {
  ABOUT_DATA,
  ABOUT_PROJECT,
  DATA_SOURCE_LABEL,
  DATA_SOURCE_URL,
  TITLE,
} from '../content/about';
import type { InfoSection } from '../state/types';
import { ARROW, h } from './dom';
import type { Component, UiContext } from './types';

export interface InfoPanelComponent extends Component {
  setModeLabel(text: string): void;
}

function setInert(el: HTMLElement, inert: boolean): void {
  if (inert) el.setAttribute('inert', '');
  else el.removeAttribute('inert');
  el.setAttribute('aria-hidden', String(inert));
}

export function createInfoPanel({ actions }: UiContext): InfoPanelComponent {
  const mode = h('span', { class: 'sidebar-strip__mode', 'data-testid': 'strip-mode' });
  const trigger = h('button', {
    class: 'panel-trigger',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'panel-info-subsections',
    'aria-label': 'Open HOW EUROPE WORKS',
    'data-testid': 'open-info',
    onclick: () => actions.setSidebarPanel('info'),
  });

  const sections: {
    id: InfoSection;
    title: string;
    body: string;
    href?: string;
    linkLabel?: string;
  }[] = [
    { id: 'about', title: 'About this Project', body: ABOUT_PROJECT },
    {
      id: 'data',
      title: 'About the Data',
      body: ABOUT_DATA,
      href: DATA_SOURCE_URL,
      linkLabel: DATA_SOURCE_LABEL,
    },
  ];

  const parts = sections.map((s) => {
    const body = h(
      'p',
      { class: 'accordion__body' },
      s.href
        ? [
            h(
              'a',
              {
                class: 'accordion__link',
                href: s.href,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              s.linkLabel ?? s.href,
            ),
            ` ${s.body}`,
          ]
        : s.body,
    );
    const panel = h(
      'div',
      { class: 'accordion__panel', id: `info-${s.id}` },
      h('div', { class: 'accordion__panel-inner' }, body),
    );
    const toggle = h(
      'button',
      {
        class: 'panel-row accordion__toggle',
        type: 'button',
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
      el: h('section', { class: 'panel-section panel-section--accordion' }, toggle, panel),
    };
  });

  const subsections = h(
    'div',
    { class: 'panel-subsections', id: 'panel-info-subsections' },
    h(
      'button',
      {
        class: 'panel-row',
        type: 'button',
        'data-testid': 'back-to-intro',
        onclick: () => actions.startIntro(),
      },
      `${ARROW.left} Back to the Introduction`,
    ),
    parts.map((p) => p.el),
  );

  const header = h(
    'header',
    { class: 'panel-header panel-header--title' },
    h(
      'h2',
      { class: 'panel-header__big' },
      TITLE.map((line) => h('span', {}, line)),
    ),
    mode,
  );

  const content = h('div', { class: 'panel-content' }, header, subsections);

  const el = h(
    'div',
    {
      class: 'panel panel--info',
      id: 'panel-info',
      'data-testid': 'panel-info',
      'data-open': 'false',
    },
    trigger,
    content,
  );

  return {
    el,
    setModeLabel(text: string) {
      mode.textContent = text;
    },
    update(state) {
      const infoOpen = state.sidebar.panel === 'info';
      el.dataset.open = String(infoOpen);
      trigger.setAttribute('aria-expanded', String(infoOpen));
      setInert(trigger, infoOpen);
      setInert(subsections, !infoOpen);

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
