/**
 * How the explore camera takes over from another view.
 * Intro: the Switzerland donut stays at the same canvas position and size.
 * Selection: closing focus / compare opens the map on the first country in that donut.
 */
import { introDonutScreen } from '../../config/introFrame';
import type { SelectionPart } from '../../state/types';
import { framePoint, type Camera } from '../camera';
import { rectCenter, type Point, type Rect } from '../geometry';
import { selectionRadius } from '../layout/donutLayout';

export interface PlacedDonut {
  countryId: string;
  x: number;
  y: number;
  R: number;
}

/** Overview camera that puts this country's donut on top of the intro donut. */
export function cameraMatchingIntro(
  node: PlacedDonut,
  canvas: { width: number; height: number },
  viewport: Rect,
): Camera {
  const pose = introDonutScreen(canvas.width, canvas.height);
  return framePoint(node, node.R, { x: pose.x, y: pose.y }, pose.r, viewport);
}

/** Countries actually drawn for this selection. A city stands in for its country. */
export function selectedCountryIds(
  selection: readonly SelectionPart[],
  cityCountry: (cityId: string) => string | undefined,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const part of selection) {
    if (part.kind === 'country') add(part.id);
    else add(cityCountry(part.id));
  }
  return ids;
}

/**
 * Brackets only when a combined donut has a whole country in it.
 * Matches ExploreScene selection geometry.
 */
export function selectionHasBrackets(
  selection: readonly SelectionPart[],
  cityCountry: (cityId: string) => string | undefined,
): boolean {
  const countries = selection.filter((part) => part.kind === 'country');
  if (countries.length === 0) return false;
  return selectedCountryIds(selection, cityCountry).length > 1;
}

/**
 * Country the map opens on when a selection closes.
 * Whole countries win: the first one in the selection donut.
 * A selection of only cities opens on the country of the first city.
 */
export function selectionTargetCountry(
  selection: readonly SelectionPart[],
  cityCountry: (cityId: string) => string | undefined,
): string | undefined {
  for (const part of selection) {
    if (part.kind === 'country') return part.id;
  }
  for (const part of selection) {
    if (part.kind !== 'city') continue;
    const country = cityCountry(part.id);
    if (country) return country;
  }
  return undefined;
}

/** That country's centre and radius, so the map can show it at the selection donut's size. */
export function selectionAnchor(
  selection: readonly SelectionPart[],
  nodes: readonly PlacedDonut[],
  cityCountry: (cityId: string) => string | undefined,
): { point: Point; radius: number } | null {
  const id = selectionTargetCountry(selection, cityCountry);
  const node = id ? nodes.find((item) => item.countryId === id) : undefined;
  if (!node) return null;
  return { point: { x: node.x, y: node.y }, radius: node.R };
}

/**
 * `textScale` for a world donut. The camera then scales type, so a donut shown
 * at the selection radius gets the same screen type as the selection view.
 */
export function donutTextScale(donutR: number, focusR: number): number {
  if (focusR <= 0) return 1;
  return donutR / focusR;
}

/**
 * World-space scale for country centre labels on the overview map.
 * Matches `donutTextScale` when the donut is at least selection-sized on screen.
 * When zoomed out further, grows as 1/zoom so label screen size stays put
 * (readable from overview) instead of shrinking with the donuts.
 */
export function countryLabelTextScale(donutR: number, focusR: number, zoom: number): number {
  const proportional = donutTextScale(donutR, focusR);
  if (zoom <= 0) return proportional;
  return Math.max(proportional, 1 / zoom);
}

/** Overview camera that keeps a just-closed selection donut at its screen place and size. */
export function cameraMatchingSelection(
  anchor: { point: Point; radius: number },
  viewport: Rect,
  hasBrackets: boolean,
): Camera {
  const screen = rectCenter(viewport);
  const radius = selectionRadius(Math.min(viewport.w, viewport.h), hasBrackets);
  return framePoint(anchor.point, anchor.radius, screen, radius, viewport);
}
