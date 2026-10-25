/**
 * Geometry of the intro bar (Figma 415:1295 ... 419:2744), in design pixels.
 * The bar is the unrolled city segment: "up" here is "outward" on the donut.
 */
import { COMMUTE, UNEMPLOYMENT_STEPS, type GuideStyle } from '../../config/encoding';
import { theme } from '../../config/theme';
import type { IntroFigure } from '../../content/intro';
import { formatInt, formatMinutes, formatPercent } from '../../data/format';
import type { City, Level3 } from '../../data/types';
import type { Rect } from '../geometry';

const t = theme.intro;

export interface BarCallout {
  x0: number;
  x1: number;
  y: number;
  style: GuideStyle;
  tone: 'commute' | 'ink';
  label: string | null;
  labelMuted: boolean;
  /** Draw the stroke in the muted colour (interactive-legend "no data"). */
  soft: boolean;
  /** Draw on top of the box stroke (the line the box is sitting on). */
  overBox: boolean;
  /** Keep only the part to the right of the box; the rest would cross the interior. */
  outsideBox: boolean;
}

export interface BarBracket {
  x0: number;
  x1: number;
  y: number;
  strong: string;
  rest: string;
}

/** Vertical red connector between two neighbouring commute scale marks. */
export interface BarScaleArrow {
  x: number;
  y0: number;
  y1: number;
}

export interface BarGeometry {
  box: Rect;
  /** Width of the hatched commuter part from the left edge. Null when that channel is off. */
  hatchW: number | null;
  /** x of the dashed gender divider. Null when that channel is off. */
  genderX: number | null;
  genderLabel: { strong: string; rest: string } | null;
  /** Thickness of the grey band sitting on the box. */
  shadow: number;
  callouts: BarCallout[];
  /** Commute-step only: small red arrows between consecutive time lines. */
  scaleArrows: BarScaleArrow[];
  bracket: BarBracket | null;
}

export function barLayout(city: City, figure: IntroFigure): BarGeometry {
  const summary = figure === 'summary';
  const lift = figure === 'commute' || summary ? t.commuteLift : 0;
  const box: Rect = { ...t.box, y: t.box.y - lift };
  const bottom = box.y + box.h;
  const right = box.x + box.w;
  const callouts: BarCallout[] = [];
  const scaleArrows: BarScaleArrow[] = [];

  if (figure === 'unemployment') {
    const order: Level3[] = ['high', 'medium', 'low'];
    for (const level of order) {
      callouts.push({
        x0: right - t.calloutInset,
        x1: right + t.calloutPast,
        y: box.y - t.levelOffset[level],
        style: 'dotted',
        tone: 'ink',
        label: level,
        labelMuted: city.unemploymentLevel !== level,
        soft: false,
        overBox: false,
        outsideBox: false,
      });
    }
  }

  if (figure === 'commute' || summary) {
    const minutes = city.commuteMinutes;
    const baseline = COMMUTE.domain[0];
    const anchor = minutes ?? baseline;
    const nearest =
      minutes === null
        ? null
        : COMMUTE.guides.reduce((best, guide) =>
            Math.abs(guide.minutes - minutes) < Math.abs(best.minutes - minutes) ? guide : best,
          );
    /** Summary keeps the guide lines but drops the minute / no-data labels. */
    const named = figure === 'commute';

    const scaleYs: number[] = [];
    const pushScale = (opts: {
      minutes: number | null;
      style: GuideStyle;
      tone: 'commute' | 'ink';
      label: string;
      active: boolean;
      soft: boolean;
    }) => {
      const y = bottom - ((opts.minutes ?? baseline) - anchor) * t.pxPerMinute;
      const onBottom = Math.abs(y - bottom) < 1.5;
      const explained = named && opts.active && opts.tone === 'commute';
      callouts.push({
        x0: explained ? box.x + t.longGuideInset : right - t.calloutInset,
        x1: right + t.calloutPast,
        y,
        style: opts.style,
        tone: opts.tone,
        label: named ? opts.label : null,
        labelMuted: !opts.active,
        soft: opts.soft,
        overBox: onBottom,
        outsideBox: !onBottom && y > box.y && y < bottom,
      });
      scaleYs.push(y);
    };

    pushScale({
      minutes: null,
      style: 'solid',
      tone: 'ink',
      label: formatMinutes(null),
      active: minutes === null,
      soft: true,
    });
    for (const guide of COMMUTE.guides) {
      pushScale({
        minutes: guide.minutes,
        style: guide.style,
        tone: 'commute',
        label: formatMinutes(guide.minutes),
        active: nearest !== null && guide.minutes === nearest.minutes,
        soft: false,
      });
    }

    if (named) {
      const sorted = [...scaleYs].sort((a, b) => a - b);
      const x = right + t.scaleArrow.x;
      for (let i = 0; i < sorted.length - 1; i++) {
        const y0 = sorted[i]!;
        const y1 = sorted[i + 1]!;
        scaleArrows.push({ x, y0, y1 });
      }
    }
  }

  const rateW = city.commuterRate === null ? null : box.w * city.commuterRate;
  const hatchOn = figure === 'commuters' || summary;
  let bracket: BarBracket | null = null;
  if (figure === 'people') {
    bracket = {
      x0: box.x,
      x1: right - 1,
      y: bottom + t.bracket.peopleGap,
      strong: formatInt(city.workingPeople),
      rest: ' working people',
    };
  } else if (figure === 'commuters' && rateW !== null) {
    bracket = {
      x0: box.x,
      x1: box.x + rateW,
      y: bottom + t.bracket.commuterGap,
      strong: formatPercent(city.commuterRate),
      rest: '',
    };
  }

  const genderOn = figure === 'gender' || summary;
  const genderX = genderOn && city.maleShare !== null ? box.x + box.w * city.maleShare : null;

  return {
    box,
    hatchW: hatchOn ? rateW : null,
    genderX,
    genderLabel:
      genderX !== null ? { strong: `${formatPercent(city.maleShare)} `, rest: 'male' } : null,
    shadow:
      (figure === 'unemployment' || summary) && city.unemploymentLevel
        ? t.shadowStep * UNEMPLOYMENT_STEPS[city.unemploymentLevel]
        : 0,
    callouts,
    scaleArrows,
    bracket,
  };
}
