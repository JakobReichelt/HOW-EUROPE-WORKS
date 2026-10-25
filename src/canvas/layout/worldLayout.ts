/**
 * Positions of all country donuts on the explore canvas, in world units (= Figma design px).
 * Seeded from each country's geographic centre, then pushed apart until the drawn rings
 * sit a fixed gap apart and never overlap. A last pass pulls any floater onto its nearest
 * neighbour, so every donut touches another. Deterministic: same input -> same output.
 */
import { theme } from '../../config/theme';
import type { City, Country } from '../../data/types';
import type { Rect } from '../geometry';
import { drawnExtent } from './donutLayout';

const w = theme.world;
/** Rough centre of the countries in the dataset. Latitude where longitude is true to scale. */
const GEO_ORIGIN = { lon: 10, lat: 48 };
const MAX_PASSES = 500;

export interface WorldNode {
  countryId: string;
  x: number;
  y: number;
  R: number;
  outer: number;
}

/** Radius by sqrt(working people), interpolated between world.minRadius and world.maxRadius. */
export function radiusScale(countries: Country[]): (workingPeople: number) => number {
  const roots = countries.map((c) => Math.sqrt(Math.max(0, c.workingPeople)));
  const lo = Math.min(...roots);
  const hi = Math.max(...roots);
  return (workingPeople) => {
    if (hi <= lo) return w.maxRadius;
    const t = (Math.sqrt(Math.max(0, workingPeople)) - lo) / (hi - lo);
    return w.minRadius + (w.maxRadius - w.minRadius) * Math.min(1, Math.max(0, t));
  };
}

/** Equirectangular seed. y grows south, matching canvas coordinates. */
function geoPoint(lon: number, lat: number): { x: number; y: number } {
  const lonScale = w.geoScale * Math.cos((GEO_ORIGIN.lat * Math.PI) / 180);
  return {
    x: (lon - GEO_ORIGIN.lon) * lonScale,
    y: (GEO_ORIGIN.lat - lat) * w.geoScale,
  };
}

function gap(a: WorldNode, b: WorldNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.outer - b.outer;
}

/** One pass of pairwise separation. Returns true if anything moved. */
function separate(nodes: WorldNode[]): boolean {
  let moved = false;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const min = a.outer + b.outer + w.padding;
      if (dist >= min - 1e-6) continue;
      if (dist < 1e-6) {
        dx = 1;
        dy = 0;
        dist = 1;
      }
      const push = (min - dist) / 2;
      a.x -= (dx / dist) * push;
      a.y -= (dy / dist) * push;
      b.x += (dx / dist) * push;
      b.y += (dy / dist) * push;
      moved = true;
    }
  }
  return moved;
}

function nearest(nodes: WorldNode[], node: WorldNode): WorldNode | null {
  let best: WorldNode | null = null;
  let bestGap = Infinity;
  for (const other of nodes) {
    if (other === node) continue;
    const g = gap(node, other);
    if (g < bestGap) {
      bestGap = g;
      best = other;
    }
  }
  return best;
}

/** Pull any donut that is not resting on another toward its nearest neighbour. */
function pullToContact(nodes: WorldNode[]): boolean {
  let moved = false;
  for (const node of nodes) {
    const other = nearest(nodes, node);
    if (!other) continue;
    const excess = gap(node, other) - w.padding;
    if (excess <= 0.5) continue;
    const dx = other.x - node.x;
    const dy = other.y - node.y;
    const dist = Math.hypot(dx, dy) || 1;
    const shift = excess * 0.35;
    node.x += (dx / dist) * shift;
    node.y += (dy / dist) * shift;
    moved = true;
  }
  return moved;
}

function separateFully(nodes: WorldNode[]): void {
  for (let pass = 0; pass < MAX_PASSES && separate(nodes); pass++);
}

export function worldLayout(countries: Country[], cities: City[]): WorldNode[] {
  const radius = radiusScale(countries);
  const citiesOf = new Map<string, City[]>();
  for (const city of cities) {
    const list = citiesOf.get(city.country);
    if (list) list.push(city);
    else citiesOf.set(city.country, [city]);
  }
  const nodes: WorldNode[] = countries.map((c) => {
    const R = radius(c.workingPeople);
    const p = geoPoint(c.geo.lon, c.geo.lat);
    return { countryId: c.id, x: p.x, y: p.y, R, outer: drawnExtent(R, citiesOf.get(c.id) ?? []) };
  });
  if (nodes.length === 0) return nodes;

  separateFully(nodes);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (!pullToContact(nodes)) break;
    separateFully(nodes);
  }
  separateFully(nodes);
  return nodes;
}

export function worldBounds(nodes: WorldNode[]): Rect {
  if (nodes.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  const minX = Math.min(...nodes.map((n) => n.x - n.outer));
  const maxX = Math.max(...nodes.map((n) => n.x + n.outer));
  const minY = Math.min(...nodes.map((n) => n.y - n.outer));
  const maxY = Math.max(...nodes.map((n) => n.y + n.outer));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
