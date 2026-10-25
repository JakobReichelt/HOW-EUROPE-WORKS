import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNEMPLOYMENT_STEPS } from '../src/config/encoding';
import { theme } from '../src/config/theme';
import { LEGEND } from '../src/content/about';
import { formatRate } from '../src/data/format';
import type { Dataset } from '../src/data/types';
import { commuteRadius, donutLayout, selectionRadius } from '../src/canvas/layout/donutLayout';
import {
  clockAngle,
  hemisphereDir,
  placeLegendSnippets,
  quarterOf,
  textAtTip,
} from '../src/canvas/layout/legendLayout';
import { polar, type Rect } from '../src/canvas/geometry';

const L = theme.legend;
const center = { x: 400, y: 400 };
const dataset = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/europe.json'), 'utf8'),
) as Dataset;

function width(text: string): number {
  const approx: Record<string, number> = {
    'no data': 52,
    '5%': 22,
    '9%': 22,
    '13%': 28,
    '30 min': 42,
    '40 min': 42,
    '50 min': 42,
    '30 min way to work': 118,
    '40 min way to work': 118,
  };
  return approx[text] ?? text.length * 7;
}

function place(
  near: number,
  direction: 1 | -1,
  marks: { r: number; text: string }[],
  sizeScale = 1,
) {
  return placeLegendSnippets(
    center,
    near,
    direction,
    marks.map((mark) => ({ ...mark, textWidth: width(mark.text) })),
    sizeScale,
  );
}

function boxesOf(placed: ReturnType<typeof placeLegendSnippets>, sizeScale = 1): Rect[] {
  const fontH = theme.font.xs * sizeScale;
  return placed.map((item) => {
    const w = width(item.text);
    const x =
      item.align === 'left'
        ? item.at.x
        : item.align === 'right'
          ? item.at.x - w
          : item.at.x - w / 2;
    return { x, y: item.at.y - fontH / 2, w, h: fontH };
  });
}

function anyOverlap(rects: Rect[], gap = L.labelGap): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const hit = !(
        a.x + a.w + gap <= b.x ||
        b.x + b.w + gap <= a.x ||
        a.y + a.h + gap <= b.y ||
        b.y + b.h + gap <= a.y
      );
      if (hit) return true;
    }
  }
  return false;
}

function ringMarks(base: number, step: number) {
  return [
    { r: base, text: 'no data' },
    { r: base + step, text: '5%' },
    { r: base + step * 2, text: '9%' },
    { r: base + step * 3, text: '13%' },
  ];
}

describe('clock / hemisphere rules', () => {
  it("maps math angles to clock angles (0 at 12 o'clock, CW)", () => {
    expect(clockAngle(-Math.PI / 2)).toBeCloseTo(0, 5);
    expect(clockAngle(0)).toBeCloseTo(Math.PI / 2, 5);
    expect(clockAngle(Math.PI / 2)).toBeCloseTo(Math.PI, 5);
    expect(clockAngle(Math.PI)).toBeCloseTo((3 * Math.PI) / 2, 5);
  });

  it('picks CW on the right half and CCW on the left half', () => {
    // Top-right (math -PI/4) -> clock ~PI/4 -> right -> CW
    expect(hemisphereDir(-Math.PI / 4)).toBe(1);
    // Bottom-right (math PI/4) -> clock ~3PI/4 -> right -> CW
    expect(hemisphereDir(Math.PI / 4)).toBe(1);
    // Bottom-left (math 3PI/4) -> clock ~5PI/4 -> left -> CCW
    expect(hemisphereDir((3 * Math.PI) / 4)).toBe(-1);
    // Top-left (math -3PI/4) -> clock ~7PI/4 -> left -> CCW
    expect(hemisphereDir((-3 * Math.PI) / 4)).toBe(-1);
  });

  it('classifies tip quarters including peaks', () => {
    expect(quarterOf(-Math.PI / 2)).toBe('top');
    expect(quarterOf(0)).toBe('right');
    expect(quarterOf(Math.PI / 2)).toBe('bottom');
    expect(quarterOf(Math.PI)).toBe('left');
  });
});

describe('text at tip', () => {
  it('grows into the callout tangent (left open space -> right-align)', () => {
    // Upper-left, shooting CCW: open space is further left.
    const leftAng = Math.PI + 0.4;
    const leftTip = polar(center.x, center.y, 200, leftAng);
    const left = textAtTip(center, leftAng, leftTip, 8, -1);
    expect(left.align).toBe('right');
    expect(left.at.x).toBeLessThan(leftTip.x);

    // Upper-right, shooting CW: open space is further right (Marseille commute).
    const rightAng = -0.5;
    const rightTip = polar(center.x, center.y, 200, rightAng);
    const right = textAtTip(center, rightAng, rightTip, 8, 1);
    expect(right.align).toBe('left');
    expect(right.at.x).toBeGreaterThan(rightTip.x);
  });

  it("right-aligns Marseille-style tips near 12 o'clock when shooting CCW", () => {
    // Tip still in the clock "right" half, but CCW open space is to the left.
    const tipAng = -1.1;
    const tip = polar(center.x, center.y, 300, tipAng);
    expect(clockAngle(tipAng)).toBeLessThan(Math.PI / 2);
    const placed = textAtTip(center, tipAng, tip, 8, -1);
    expect(placed.align).toBe('right');
  });

  it('centers above the top peak and below the bottom peak', () => {
    const topTip = polar(center.x, center.y, 200, -Math.PI / 2);
    const top = textAtTip(center, -Math.PI / 2, topTip, 8, -1);
    expect(top.align).toBe('center');
    expect(top.at.y).toBeLessThan(topTip.y);

    const bottomTip = polar(center.x, center.y, 200, Math.PI / 2);
    const bottom = textAtTip(center, Math.PI / 2, bottomTip, 8, 1);
    expect(bottom.align).toBe('center');
    expect(bottom.at.y).toBeGreaterThan(bottomTip.y);
  });
});

describe('legend staircase placement', () => {
  it('makes outer rings longer in pixels than inner rings in every quarter', () => {
    const marks = ringMarks(180, 14);
    const nears = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    for (const near of nears) {
      for (const direction of [1, -1] as const) {
        const placed = place(near, direction, marks);
        const byR = [...placed].sort((a, b) => a.r - b.r);
        for (let i = 1; i < byR.length; i++) {
          expect(byR[i]!.pixelLength).toBeGreaterThan(byR[i - 1]!.pixelLength);
        }
      }
    }
  });

  it('keeps label boxes clear with a long active string', () => {
    const R = 300;
    const baseline = R * theme.donut.baseline;
    const placed = place(-0.55, 1, [
      { r: baseline, text: 'no data' },
      { r: baseline + R * 0.09, text: '30 min way to work' },
      { r: baseline + R * 0.18, text: '40 min' },
      { r: baseline + R * 0.27, text: '50 min' },
    ]);
    expect(anyOverlap(boxesOf(placed))).toBe(false);
    const byR = [...placed].sort((a, b) => a.r - b.r);
    for (let i = 1; i < byR.length; i++) {
      expect(byR[i]!.pixelLength).toBeGreaterThan(byR[i - 1]!.pixelLength);
    }
  });

  it('keeps tight unemployment marks clear', () => {
    const R = 220;
    const marks = ringMarks(R * 0.66, R * theme.donut.shadowStep);
    for (const near of [Math.PI / 2, Math.PI, -2.2]) {
      const placed = place(near, -1, marks);
      expect(anyOverlap(boxesOf(placed))).toBe(false);
    }
  });

  it('never wraps past resolveArc', () => {
    const marks = Array.from({ length: 4 }, (_, i) => ({
      r: 140 + i * 20,
      text: '30 min way to work',
    }));
    for (const near of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
      const placed = place(near, 1, marks);
      for (const item of placed) {
        expect(item.a1 - item.a0).toBeLessThanOrEqual(L.resolveArc + 1e-9);
      }
    }
  });

  it('places Marseille callouts without overlap and outer-long', () => {
    const cities = dataset.cities.filter((city) => city.country === 'FR');
    const R = selectionRadius(900, true);
    const g = donutLayout([{ countryId: 'FR', cities }], { cx: center.x, cy: center.y, R });
    const seg = g.segments.find((s) => s.cityId === 'marseille');
    expect(seg).toBeTruthy();
    // Marseille sits just east of 12 o'clock -> right hemisphere -> CW preferred.
    expect(hemisphereDir((seg!.a0 + seg!.a1) / 2)).toBe(1);

    const step = g.R * theme.donut.shadowStep;
    const unemployment = place(seg!.a0 - theme.donut.gap, -1, [
      { r: seg!.r1, text: LEGEND.noData },
      { r: seg!.r1 + step * UNEMPLOYMENT_STEPS.low, text: formatRate(5) },
      { r: seg!.r1 + step * UNEMPLOYMENT_STEPS.medium, text: formatRate(9) },
      { r: seg!.r1 + step * UNEMPLOYMENT_STEPS.high, text: formatRate(13) },
    ]);
    const commute = place(seg!.a1 + theme.donut.gap, 1, [
      { r: commuteRadius(g.R, null), text: LEGEND.noData },
      { r: g.guides[0]!.r, text: '30 min way to work' },
      { r: g.guides[1]!.r, text: '40 min' },
      { r: g.guides[2]!.r, text: '50 min' },
    ]);
    expect(anyOverlap(boxesOf(unemployment))).toBe(false);
    expect(anyOverlap(boxesOf(commute))).toBe(false);
    for (const side of [unemployment, commute]) {
      const byR = [...side].sort((a, b) => a.r - b.r);
      for (let i = 1; i < byR.length; i++) {
        expect(byR[i]!.pixelLength).toBeGreaterThan(byR[i - 1]!.pixelLength);
      }
    }
  });

  it('stays clear for every Austria city on a focus donut', () => {
    const cities = dataset.cities.filter((city) => city.country === 'AT');
    const R = selectionRadius(900, true);
    const g = donutLayout([{ countryId: 'AT', cities }], { cx: 600, cy: 480, R });
    for (const seg of g.segments) {
      const step = g.R * theme.donut.shadowStep;
      const unemployment = place(seg.a0 - theme.donut.gap, -1, [
        { r: seg.r1, text: LEGEND.noData },
        { r: seg.r1 + step * UNEMPLOYMENT_STEPS.low, text: formatRate(5) },
        { r: seg.r1 + step * UNEMPLOYMENT_STEPS.medium, text: formatRate(9) },
        { r: seg.r1 + step * UNEMPLOYMENT_STEPS.high, text: formatRate(13) },
      ]);
      const commute = place(seg.a1 + theme.donut.gap, 1, [
        { r: commuteRadius(g.R, null), text: LEGEND.noData },
        ...g.guides.map((guide) => ({ r: guide.r, text: `${guide.minutes} min` })),
      ]);
      expect(anyOverlap(boxesOf(unemployment))).toBe(false);
      expect(anyOverlap(boxesOf(commute))).toBe(false);
    }
  });
});
