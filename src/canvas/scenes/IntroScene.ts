/**
 * Intro story (Figma 415:1295 ... 419:2812). Steps 1-6 draw the Zurich bar; step 7 draws
 * the Switzerland donut. Copy and buttons are DOM, placed on the same design frame.
 * Between unemployment and commute, only the rectangle slides. The legend swaps with the step.
 */
import { introFrame } from '../../config/introFrame';
import { theme } from '../../config/theme';
import {
  INTRO_CITY_ID,
  INTRO_COUNTRY_ID,
  INTRO_STEPS,
  type IntroFigure,
} from '../../content/intro';
import { citiesOf } from '../../data/selectors';
import { easeInOutCubic, lerp, motionMs, progress } from '../anim/tween';
import { drawBar } from '../draw/bar';
import { drawDonut } from '../draw/donut';
import { barLayout, commuteSlideLayout } from '../layout/barLayout';
import { donutLayout } from '../layout/donutLayout';
import type { Scene, SceneContext } from './Scene';

interface BarSlide {
  from: number;
  to: number;
  startMs: number;
}

export class IntroScene implements Scene {
  private seenStep = -1;
  private slide: BarSlide | null = null;

  isAnimating(): boolean {
    return this.slide !== null && this.eased(performance.now()) < 1;
  }

  draw(ctx: SceneContext): void {
    const { p, data, state } = ctx;
    const step = INTRO_STEPS[state.introStep];
    const city = data.cityById.get(INTRO_CITY_ID);
    if (!step || !city) return;

    const now = performance.now();
    this.syncStep(state.introStep, now);

    const frame = introFrame(p.width, p.height);
    p.push();
    p.translate(frame.ox, frame.oy);
    p.scale(frame.scale);

    if (step.figure === 'donut') {
      const { cx, cy, R } = theme.intro.donut;
      const geom = donutLayout(
        [{ countryId: INTRO_COUNTRY_ID, cities: citiesOf(data, INTRO_COUNTRY_ID) }],
        { cx, cy, R },
      );
      drawDonut(p, geom, {
        label: data.countryById.get(INTRO_COUNTRY_ID)?.name ?? null,
        sectorFilter: 'none',
      });
    } else if (
      this.slide &&
      this.eased(now) < 1 &&
      (step.figure === 'unemployment' || step.figure === 'commute')
    ) {
      const lift = lerp(this.slide.from, this.slide.to, this.eased(now));
      drawBar(p, commuteSlideLayout(city, step.figure, lift / theme.intro.commuteLift));
    } else {
      drawBar(p, barLayout(city, step.figure));
    }
    p.pop();
  }

  /** Start a slide only when the step actually changes between these two figures. */
  private syncStep(step: number, now: number): void {
    if (step === this.seenStep) return;
    const prev = this.seenStep;
    const fromLift = this.liftAt(prev, now);
    this.seenStep = step;
    const prevFigure = INTRO_STEPS[prev]?.figure;
    const nextFigure = INTRO_STEPS[step]?.figure;
    if (!isCommuteSlide(prevFigure, nextFigure)) {
      this.slide = null;
      return;
    }
    this.slide = {
      from: fromLift,
      to: nextFigure === 'commute' ? theme.intro.commuteLift : 0,
      startMs: now,
    };
  }

  private liftAt(step: number, now: number): number {
    if (this.slide) return lerp(this.slide.from, this.slide.to, this.eased(now));
    const figure = INTRO_STEPS[step]?.figure;
    return figure === 'commute' || figure === 'summary' ? theme.intro.commuteLift : 0;
  }

  private eased(now: number): number {
    if (!this.slide) return 1;
    return easeInOutCubic(progress(this.slide.startMs, now, motionMs(theme.motion.introMs)));
  }

  describe(ctx: SceneContext): string {
    const step = INTRO_STEPS[ctx.state.introStep];
    return `Intro step ${ctx.state.introStep + 1} of ${INTRO_STEPS.length}: ${step?.figure ?? ''}`;
  }

  inspect(ctx: SceneContext): unknown {
    return {
      step: ctx.state.introStep,
      figure: INTRO_STEPS[ctx.state.introStep]?.figure,
      sliding: this.isAnimating(),
    };
  }
}

function isCommuteSlide(from: IntroFigure | undefined, to: IntroFigure | undefined): boolean {
  return (
    (from === 'unemployment' && to === 'commute') || (from === 'commute' && to === 'unemployment')
  );
}
