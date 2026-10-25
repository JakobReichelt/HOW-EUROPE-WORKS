import { describe, expect, it } from 'vitest';
import { theme } from '../src/config/theme';
import { circleHitsViewport, detailLevel } from '../src/canvas/view/visibility';

const vp = { x: 0, y: 0, w: 100, h: 100 };

describe('circleHitsViewport', () => {
  const cam = { x: 0, y: 0, zoom: 1 };

  it('hits a circle over the viewport centre', () => {
    expect(circleHitsViewport(cam, vp, 0, 0, 10, 0)).toBe(true);
  });

  it('misses a circle fully outside', () => {
    expect(circleHitsViewport(cam, vp, 200, 0, 10, 0)).toBe(false);
  });

  it('hits a circle that only overlaps the edge', () => {
    expect(circleHitsViewport(cam, vp, 50, 0, 10, 0)).toBe(true);
  });

  it('uses pad to keep labels that sit just outside the radius', () => {
    expect(circleHitsViewport(cam, vp, 70, 0, 10, 0)).toBe(false);
    expect(circleHitsViewport(cam, vp, 70, 0, 10, 15)).toBe(true);
  });

  it('scales the circle by zoom', () => {
    const far = { x: 0, y: 0, zoom: 0.5 };
    expect(circleHitsViewport(far, vp, 200, 0, 10, 0)).toBe(false);
    expect(circleHitsViewport(far, vp, 80, 0, 10, 0)).toBe(true);
  });
});

describe('detailLevel', () => {
  it('is mark below the theme threshold and full at it', () => {
    const t = theme.canvas.fullRadius;
    expect(detailLevel(t - 0.1)).toBe('mark');
    expect(detailLevel(t)).toBe('full');
  });
});
