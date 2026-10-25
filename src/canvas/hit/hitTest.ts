/** Polar hit testing against DonutGeometry. Coordinates must be in the same space as the geometry. */
import { START_ANGLE, type DonutGeometry } from '../layout/donutLayout';
import { normalizeAngle } from '../geometry';

export interface Hit {
  countryId: string;
  /** null = inside the donut, but not on a city (centre, or off the ring). */
  cityId: string | null;
}

/** Radius of the drawn donut: the further of the guide rings and the city segments. */
export function donutHitRadius(g: DonutGeometry): number {
  let radius = 0;
  for (const guide of g.guides) radius = Math.max(radius, guide.r);
  for (const segment of g.segments) radius = Math.max(radius, segment.r1 + segment.shadow);
  return radius;
}

/** Half the opening between two cities. Each side of that opening belongs to the nearer segment. */
function segmentPad(g: DonutGeometry): number {
  const [first, second] = g.segments;
  if (!first || !second) return 0;
  return Math.max(0, (second.a0 - first.a1) / 2);
}

/** Inside the drawn donut only. The packing margin outside the rings is a miss. */
export function hitDonut(g: DonutGeometry, x: number, y: number): Hit | null {
  const dx = x - g.cx;
  const dy = y - g.cy;
  const dist = Math.hypot(dx, dy);
  if (dist > donutHitRadius(g)) return null;
  const angle = normalizeAngle(Math.atan2(dy, dx), START_ANGLE);
  const pad = segmentPad(g);

  for (const s of g.segments) {
    const inAngle = angle >= s.a0 - pad && angle < s.a1 + pad;
    if (inAngle && dist >= s.r0 && dist <= s.r1 + s.shadow) {
      return { countryId: s.countryId, cityId: s.cityId };
    }
  }
  const group = g.groups.find((gr) => angle >= gr.a0 && angle <= gr.a1) ?? g.groups[0];
  const countryId = group?.countryId ?? g.countryIds[0];
  return countryId ? { countryId, cityId: null } : null;
}

/** First hit in a list of donuts, topmost (last drawn) first. */
export function hitDonuts(geoms: DonutGeometry[], x: number, y: number): Hit | null {
  for (let i = geoms.length - 1; i >= 0; i--) {
    const g = geoms[i];
    const hit = g ? hitDonut(g, x, y) : null;
    if (hit) return hit;
  }
  return null;
}
