import { describe, expect, it } from 'vitest';
import { framePoint, worldToScreen } from '../src/canvas/camera';
import { selectionRadius } from '../src/canvas/layout/donutLayout';
import {
  cameraMatchingIntro,
  cameraMatchingSelection,
  countryLabelTextScale,
  donutTextScale,
  selectionAnchor,
  selectionHasBrackets,
  selectionTargetCountry,
} from '../src/canvas/view/handoff';
import { introDonutScreen } from '../src/config/introFrame';
import { theme } from '../src/config/theme';
import type { SelectionPart } from '../src/state/types';

function exploreViewport(width: number, height: number) {
  const left = theme.layout.stripWidth + theme.layout.panelWidth;
  return { x: left, y: 0, w: width - left, h: height };
}

describe('cameraMatchingIntro', () => {
  it('puts the country donut on the intro donut', () => {
    const width = 1600;
    const height = 1000;
    const viewport = exploreViewport(width, height);
    const node = { countryId: 'CH', x: 120, y: -40, R: 280 };
    const camera = cameraMatchingIntro(node, { width, height }, viewport);
    const pose = introDonutScreen(width, height);
    const screen = worldToScreen(camera, viewport, node);
    expect(screen.x).toBeCloseTo(pose.x);
    expect(screen.y).toBeCloseTo(pose.y);
    expect(node.R * camera.zoom).toBeCloseTo(pose.r);
  });

  it('keeps the screen point when zoom is clamped', () => {
    const viewport = { x: 0, y: 0, w: 200, h: 200 };
    const world = { x: 10, y: 20 };
    const camera = framePoint(world, 1, { x: 40, y: 50 }, 100, viewport);
    expect(camera.zoom).toBe(theme.zoom.max);
    const screen = worldToScreen(camera, viewport, world);
    expect(screen.x).toBeCloseTo(40);
    expect(screen.y).toBeCloseTo(50);
  });
});

describe('selection handoff', () => {
  const nodes = [
    { countryId: 'FR', x: 0, y: 0, R: 400 },
    { countryId: 'DE', x: 800, y: 100, R: 300 },
  ];
  const cityCountry = (id: string) => (id === 'berlin' ? 'DE' : id === 'paris' ? 'FR' : undefined);

  it('anchors one country on itself', () => {
    const selection: SelectionPart[] = [{ kind: 'country', id: 'FR' }];
    expect(selectionAnchor(selection, nodes, cityCountry)).toEqual({
      point: { x: 0, y: 0 },
      radius: 400,
    });
    expect(selectionHasBrackets(selection, cityCountry)).toBe(false);
  });

  it('anchors a city on its country', () => {
    const selection: SelectionPart[] = [{ kind: 'city', id: 'berlin' }];
    expect(selectionAnchor(selection, nodes, cityCountry)).toEqual({
      point: { x: 800, y: 100 },
      radius: 300,
    });
    expect(selectionHasBrackets(selection, cityCountry)).toBe(false);
  });

  it('opens on the first country in the selection, ahead of later countries and cities', () => {
    const countries: SelectionPart[] = [
      { kind: 'country', id: 'DE' },
      { kind: 'country', id: 'FR' },
    ];
    expect(selectionTargetCountry(countries, cityCountry)).toBe('DE');
    expect(selectionAnchor(countries, nodes, cityCountry)).toEqual({
      point: { x: 800, y: 100 },
      radius: 300,
    });

    const mixed: SelectionPart[] = [
      { kind: 'city', id: 'berlin' },
      { kind: 'country', id: 'FR' },
    ];
    expect(selectionTargetCountry(mixed, cityCountry)).toBe('FR');
    expect(selectionHasBrackets(mixed, cityCountry)).toBe(true);
  });

  it('opens a city selection on the country of the first city', () => {
    const selection: SelectionPart[] = [
      { kind: 'city', id: 'paris' },
      { kind: 'city', id: 'berlin' },
    ];
    expect(selectionTargetCountry(selection, cityCountry)).toBe('FR');
    expect(selectionAnchor(selection, nodes, cityCountry)).toEqual({
      point: { x: 0, y: 0 },
      radius: 400,
    });
  });

  it('gives a donut selection-sized type when it is shown at the selection radius', () => {
    const worldR = 280;
    const focusR = 400;
    const zoom = focusR / worldR;
    expect(donutTextScale(worldR, focusR) * zoom).toBeCloseTo(1);
    expect(donutTextScale(worldR, 0)).toBe(1);
  });

  it('gives legend sizeScale 1 for a selection donut, and screenR/focusR in overview', () => {
    const focusR = 400;
    expect(donutTextScale(focusR, focusR)).toBeCloseTo(1);
    const screenR = 200;
    expect(donutTextScale(screenR, focusR)).toBeCloseTo(0.5);
  });

  it('keeps country centre labels at least font-sized on screen when zoomed out', () => {
    const worldR = 280;
    const focusR = 400;
    const refZoom = focusR / worldR;
    expect(countryLabelTextScale(worldR, focusR, refZoom) * refZoom).toBeCloseTo(1);
    const outZoom = refZoom / 3;
    expect(countryLabelTextScale(worldR, focusR, outZoom) * outZoom).toBeCloseTo(1);
    const inZoom = refZoom * 2;
    expect(countryLabelTextScale(worldR, focusR, inZoom)).toBeCloseTo(
      donutTextScale(worldR, focusR),
    );
  });

  it('frames the anchor at the selection donut size, in the viewport centre', () => {
    const viewport = exploreViewport(1536, 960);
    const anchor = { point: { x: 10, y: 20 }, radius: 250 };
    const camera = cameraMatchingSelection(anchor, viewport, false);
    const screen = worldToScreen(camera, viewport, anchor.point);
    expect(screen.x).toBeCloseTo(viewport.x + viewport.w / 2);
    expect(screen.y).toBeCloseTo(viewport.y + viewport.h / 2);
    expect(anchor.radius * camera.zoom).toBeCloseTo(
      selectionRadius(Math.min(viewport.w, viewport.h), false),
    );
  });
});
