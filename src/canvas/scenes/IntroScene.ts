/**
 * Intro story (Figma 415:1295 ... 419:2812). Steps 1-6 draw the Zurich bar; step 7 draws
 * the Switzerland donut. Copy and buttons are DOM, placed on the same design frame.
 */
import { introFrame } from '../../config/introFrame';
import { theme } from '../../config/theme';
import { INTRO_CITY_ID, INTRO_COUNTRY_ID, INTRO_STEPS } from '../../content/intro';
import { citiesOf } from '../../data/selectors';
import { drawBar } from '../draw/bar';
import { drawDonut } from '../draw/donut';
import { barLayout } from '../layout/barLayout';
import { donutLayout } from '../layout/donutLayout';
import type { Scene, SceneContext } from './Scene';

export class IntroScene implements Scene {
  draw(ctx: SceneContext): void {
    const { p, data, state } = ctx;
    const step = INTRO_STEPS[state.introStep];
    const city = data.cityById.get(INTRO_CITY_ID);
    if (!step || !city) return;

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
    } else {
      drawBar(p, barLayout(city, step.figure));
    }
    p.pop();
  }

  describe(ctx: SceneContext): string {
    const step = INTRO_STEPS[ctx.state.introStep];
    return `Intro step ${ctx.state.introStep + 1} of ${INTRO_STEPS.length}: ${step?.figure ?? ''}`;
  }

  inspect(ctx: SceneContext): unknown {
    return { step: ctx.state.introStep, figure: INTRO_STEPS[ctx.state.introStep]?.figure };
  }
}
