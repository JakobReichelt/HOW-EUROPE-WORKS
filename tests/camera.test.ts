import { describe, expect, it } from 'vitest';
import { fitCamera, fitZoom, panBy, wheelPan, zoomAt } from '../src/canvas/camera';
import { theme } from '../src/config/theme';

describe('camera fit / zoom limits', () => {
  const bounds = { x: 0, y: 0, w: 2000, h: 1000 };
  const viewport = { x: 0, y: 0, w: 800, h: 600 };

  it('fitZoom leaves fitPadding on each side', () => {
    const zoom = fitZoom(bounds, viewport, 40);
    expect(zoom).toBeCloseTo(Math.min((800 - 80) / 2000, (600 - 80) / 1000));
    const cam = fitCamera(bounds, viewport, 40);
    expect(cam.zoom).toBeCloseTo(zoom);
    expect(cam.x).toBeCloseTo(1000);
    expect(cam.y).toBeCloseTo(500);
  });

  it('zoomAt respects overview min so the map cannot shrink past a full fit', () => {
    const min = fitZoom(bounds, viewport, theme.zoom.fitPadding);
    const cam = { x: 1000, y: 500, zoom: min };
    const next = zoomAt(cam, viewport, { x: 400, y: 300 }, 1 / theme.zoom.wheelStep, {
      min,
      max: theme.zoom.max,
    });
    expect(next.zoom).toBeCloseTo(min);
  });
});

describe('wheel pan', () => {
  const viewport = { w: 800, h: 600 };
  const cam = { x: 0, y: 0, zoom: 2 };

  it('uses trackpad and pixel-wheel deltas 1:1, view following the scroll', () => {
    const { x, y } = wheelPan({ deltaX: 40, deltaY: 100, deltaMode: 0 }, viewport);
    const next = panBy(cam, x, y);
    expect(next.x).toBeCloseTo(20);
    expect(next.y).toBeCloseTo(50);
  });

  it('converts line-mode notches into wheelLinePx', () => {
    const { x, y } = wheelPan({ deltaX: -1, deltaY: 3, deltaMode: 1 }, viewport);
    const next = panBy(cam, x, y);
    expect(next.x).toBeCloseTo(-theme.zoom.wheelLinePx / cam.zoom);
    expect(next.y).toBeCloseTo((3 * theme.zoom.wheelLinePx) / cam.zoom);
  });

  it('treats one page as the viewport size on that axis', () => {
    const { x, y } = wheelPan({ deltaX: 1, deltaY: -1, deltaMode: 2 }, viewport);
    const next = panBy(cam, x, y);
    expect(next.x).toBeCloseTo(viewport.w / cam.zoom);
    expect(next.y).toBeCloseTo(-viewport.h / cam.zoom);
  });
});
