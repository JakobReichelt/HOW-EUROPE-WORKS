/** Landing (Figma 393:13621): two faded donut fragments behind the DOM title. Static for now. */
import { introFrame } from '../../config/introFrame';
import { theme } from '../../config/theme';
import { citiesOf } from '../../data/selectors';
import { drawDonut } from '../draw/donut';
import { donutLayout } from '../layout/donutLayout';
import type { Scene, SceneContext } from './Scene';

export class LandingScene implements Scene {
  draw(ctx: SceneContext): void {
    const { p, data } = ctx;
    const frame = introFrame(p.width, p.height);
    p.push();
    p.translate(frame.ox, frame.oy);
    p.scale(frame.scale);
    for (const f of theme.landing.fragments) {
      const geom = donutLayout([{ countryId: f.countryId, cities: citiesOf(data, f.countryId) }], {
        cx: 0,
        cy: 0,
        R: f.R,
      });
      p.push();
      p.translate(f.x, f.y);
      p.rotate(f.rotation);
      drawDonut(p, geom, { alpha: theme.landing.opacity, details: false });
      p.pop();
    }
    p.pop();
  }

  describe(): string {
    return 'HOW EUROPE WORKS - decorative background';
  }
}
