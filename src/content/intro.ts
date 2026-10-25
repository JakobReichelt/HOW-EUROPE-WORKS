/**
 * Intro story (Figma 415:1295, 415:2517, 417:2603, 419:2683, 419:2712, 419:2744, 419:2812).
 * Copy is set in design pixels on the 1536 x 960 frame. {city} is filled from the dataset.
 */
import { theme } from '../config/theme';

export const INTRO_CITY_ID = 'zurich';
export const INTRO_COUNTRY_ID = 'CH';

/** Which chart the step draws. `summary` is every channel on the bar at once. */
export type IntroFigure =
  'people' | 'commuters' | 'gender' | 'unemployment' | 'commute' | 'summary' | 'donut';

export interface IntroRun {
  text: string;
  /** Semibold emphasis, e.g. the city name or the word "commuting". */
  weight?: 'semibold';
}

export interface IntroBlock {
  x: number;
  y: number;
  width: number;
  lines: IntroRun[][];
}

export interface IntroStep {
  figmaNode: string;
  blocks: IntroBlock[];
  figure: IntroFigure;
  showBack: boolean;
  nextLabel: string;
  /** Arrow sits to the right of the label. Otherwise it sits above the word. */
  nextBeside: boolean;
}

const copy = theme.intro.copy;

function block(place: { x: number; y: number; w: number }, lines: IntroRun[][]): IntroBlock {
  return { x: place.x, y: place.y, width: place.w, lines };
}

const line = (...runs: IntroRun[]): IntroRun[] => runs;
const t = (text: string, weight?: IntroRun['weight']): IntroRun =>
  weight ? { text, weight } : { text };

export const INTRO_STEPS: IntroStep[] = [
  {
    figmaNode: '415:1295',
    blocks: [
      block(copy.opening, [
        line(t('This is '), t('{city}', 'semibold'), t('.')),
        line(t('One of many European cities.')),
      ]),
      block(copy.above, [line(t('In 2025, {city} had'))]),
    ],
    figure: 'people',
    showBack: false,
    nextLabel: 'next',
    nextBeside: false,
  },
  {
    figmaNode: '415:2517',
    blocks: [
      block(copy.lead, [
        line(t('the rate of people '), t('commuting', 'semibold'), t(' to')),
        line(t('{city} in 2025 was')),
      ]),
    ],
    figure: 'commuters',
    showBack: true,
    nextLabel: 'next',
    nextBeside: false,
  },
  {
    figmaNode: '417:2603',
    blocks: [block(copy.lead, [line(t('The people working in')), line(t('{city} were to'))])],
    figure: 'gender',
    showBack: true,
    nextLabel: 'next',
    nextBeside: false,
  },
  {
    figmaNode: '419:2683',
    blocks: [block(copy.lead, [line(t('The unemployment rate in')), line(t('{city} was'))])],
    figure: 'unemployment',
    showBack: true,
    nextLabel: 'next',
    nextBeside: false,
  },
  {
    figmaNode: '419:2712',
    blocks: [block(copy.commute, [line(t('The average time to work in')), line(t('{city} was'))])],
    figure: 'commute',
    showBack: true,
    nextLabel: 'next',
    nextBeside: false,
  },
  {
    figmaNode: '419:2744',
    blocks: [block(copy.summary, [line(t('In 2025, {city} looked like this:'))])],
    figure: 'summary',
    showBack: true,
    nextLabel: 'next',
    nextBeside: false,
  },
  {
    figmaNode: '419:2812',
    blocks: [
      block(copy.donut, [
        line(t('Together with the next two largest swiss')),
        line(t('cities, this is what {city} looks like:')),
      ]),
    ],
    figure: 'donut',
    showBack: true,
    nextLabel: 'explore Europe!',
    nextBeside: true,
  },
];

export function fillTemplate(text: string, vars: { city: string; country: string }): string {
  return text.replaceAll('{city}', vars.city).replaceAll('{country}', vars.country);
}
