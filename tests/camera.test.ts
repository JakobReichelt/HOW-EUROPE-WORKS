import { describe, expect, it } from 'vitest';
import { fitCamera, fitZoom, zoomAt } from '../src/canvas/camera';
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
