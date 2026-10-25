/** Landing (Figma 393:13621): two faded donut fragments behind the DOM title. Static for now. */
import { theme } from '../../config/theme';
import { citiesOf } from '../../data/selectors';
import { drawDonut } from '../draw/donut';
import { donutLayout } from '../layout/donutLayout';
import type { Scene, SceneContext } from './Scene';

export class LandingScene implements Scene {
  draw(ctx: SceneContext): void {
    const { p, viewport: vp, data } = ctx;
    const side = Math.min(vp.w, vp.h);
    p.push();
    for (const f of theme.landing.fragments) {
      const geom = donutLayout([{ countryId: f.countryId, cities: citiesOf(data, f.countryId) }], {
        cx: 0,
        cy: 0,
        R: side * f.radius,
      });
      p.push();
      p.translate(vp.x + vp.w * f.x, vp.y + vp.h * f.y);
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
