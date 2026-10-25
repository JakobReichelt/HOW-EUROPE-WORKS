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
  reverseStaircase,
  textAtTip,
  tipAway,
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

/** Near edge of each label box must sit past the arc tip (no strikethrough). */
function labelsPastTips(
  direction: 1 | -1,
  placed: ReturnType<typeof placeLegendSnippets>,
): boolean {
  const fontH = theme.font.xs;
  const pad = L.labelPad;
  return placed.every((item) => {
    const tipAng = direction > 0 ? item.a1 : item.a0;
    const tip = polar(center.x, center.y, item.r, tipAng);
    const away = tipAway(tipAng, direction);
    const w = width(item.text);
    // Near edge of the AABB along -away (toward the tip).
    const corners =
      item.align === 'left'
        ? [
            { x: item.at.x, y: item.at.y - fontH / 2 },
            { x: item.at.x, y: item.at.y + fontH / 2 },
          ]
        : item.align === 'right'
          ? [
              { x: item.at.x, y: item.at.y - fontH / 2 },
              { x: item.at.x, y: item.at.y + fontH / 2 },
            ]
          : [
              { x: item.at.x - w / 2, y: item.at.y - fontH / 2 },
              { x: item.at.x + w / 2, y: item.at.y - fontH / 2 },
              { x: item.at.x - w / 2, y: item.at.y + fontH / 2 },
              { x: item.at.x + w / 2, y: item.at.y + fontH / 2 },
            ];
    const nearest = Math.min(
      ...corners.map((c) => (c.x - tip.x) * away.x + (c.y - tip.y) * away.y),
    );
    return nearest >= pad * 0.85;
  });
}

describe('clock / hemisphere rules', () => {
  it("maps math angles to clock angles (0 at 12 o'clock, CW)", () => {
    expect(clockAngle(-Math.PI / 2)).toBeCloseTo(0, 5);
    expect(clockAngle(0)).toBeCloseTo(Math.PI / 2, 5);
    expect(clockAngle(Math.PI / 2)).toBeCloseTo(Math.PI, 5);
    expect(clockAngle(Math.PI)).toBeCloseTo((3 * Math.PI) / 2, 5);
  });

  it('picks CW on the right half and CCW on the left half', () => {
    expect(hemisphereDir(-Math.PI / 4)).toBe(1);
    expect(hemisphereDir(Math.PI / 4)).toBe(1);
    expect(hemisphereDir((3 * Math.PI) / 4)).toBe(-1);
    expect(hemisphereDir((-3 * Math.PI) / 4)).toBe(-1);
  });

  it('classifies tip quarters including peaks', () => {
    expect(quarterOf(-Math.PI / 2)).toBe('top');
    expect(quarterOf(0)).toBe('right');
    expect(quarterOf(Math.PI / 2)).toBe('bottom');
    expect(quarterOf(Math.PI)).toBe('left');
  });

  it('reverses staircase only for left-of-segment fans in the top/left quarter', () => {
    // Top, CCW into left open space.
    expect(reverseStaircase(-Math.PI / 2, -1)).toBe(true);
    // Left, CCW.
    expect(reverseStaircase(Math.PI, -1)).toBe(true);
    // Top, CW into right open space -> not reversed.
    expect(reverseStaircase(-Math.PI / 2, 1)).toBe(false);
    // Right, CW -> not reversed.
    expect(reverseStaircase(0, 1)).toBe(false);
    // Bottom, CCW -> not reversed (not top/left quarter).
    expect(reverseStaircase(Math.PI / 2, -1)).toBe(false);
  });
});

describe('text at tip', () => {
  const fontH = theme.font.xs;

  it('anchors past the tip so middle-baseline glyphs clear the stroke', () => {
    const leftAng = Math.PI + 0.4;
    const leftTip = polar(center.x, center.y, 200, leftAng);
    const left = textAtTip(leftAng, leftTip, L.labelPad, fontH, 52, -1);
    expect(left.align).toBe('right');
    expect(left.at.x).toBeLessThan(leftTip.x);
    const awayL = tipAway(leftAng, -1);
    const alongL = (left.at.x - leftTip.x) * awayL.x + (left.at.y - leftTip.y) * awayL.y;
    expect(alongL).toBeGreaterThanOrEqual(L.labelPad + fontH / 2 - 1e-6);

    const rightAng = -0.5;
    const rightTip = polar(center.x, center.y, 200, rightAng);
    const right = textAtTip(rightAng, rightTip, L.labelPad, fontH, 42, 1);
    expect(right.align).toBe('left');
    expect(right.at.x).toBeGreaterThan(rightTip.x);
  });

  it("right-aligns Marseille-style tips near 12 o'clock when shooting CCW", () => {
    const tipAng = -1.1;
    const tip = polar(center.x, center.y, 300, tipAng);
    expect(clockAngle(tipAng)).toBeLessThan(Math.PI / 2);
    const placed = textAtTip(tipAng, tip, L.labelPad, fontH, 28, -1);
    expect(placed.align).toBe('right');
  });

  it('centers at peaks with enough travel that half the string clears the tip', () => {
    const topTip = polar(center.x, center.y, 200, -Math.PI / 2);
    const w = 52;
    const top = textAtTip(-Math.PI / 2, topTip, L.labelPad, fontH, w, -1);
    expect(top.align).toBe('center');
    expect(top.at.x).toBeLessThan(topTip.x);
    const away = tipAway(-Math.PI / 2, -1);
    const along = (top.at.x - topTip.x) * away.x + (top.at.y - topTip.y) * away.y;
    expect(along).toBeGreaterThanOrEqual(L.labelPad + fontH / 2 + w / 2 - 1e-6);
  });
});

describe('legend staircase placement', () => {
  it('uses outer-long staircase when not in the top-left left-of-segment case', () => {
    const marks = ringMarks(180, 14);
    // Right edge CW, bottom edge CW: never reversed.
    for (const near of [0, Math.PI / 2] as const) {
      const placed = place(near, 1, marks);
      const byR = [...placed].sort((a, b) => a.r - b.r);
      for (let i = 1; i < byR.length; i++) {
        expect(byR[i]!.pixelLength).toBeGreaterThan(byR[i - 1]!.pixelLength);
      }
    }
  });

  it('reverses to inner-long when left of the segment at the top', () => {
    const marks = ringMarks(180, 14);
    const near = -Math.PI / 2;
    expect(reverseStaircase(near, -1)).toBe(true);
    const placed = place(near, -1, marks);
    const byR = [...placed].sort((a, b) => a.r - b.r);
    for (let i = 1; i < byR.length; i++) {
      expect(byR[i]!.pixelLength).toBeLessThan(byR[i - 1]!.pixelLength);
    }
    expect(anyOverlap(boxesOf(placed))).toBe(false);
    expect(labelsPastTips(-1, placed)).toBe(true);
  });

  it('keeps label boxes clear with a long active string', () => {
    const R = 300;
    const baseline = R * theme.donut.baseline;
    const near = -0.55;
    const placed = place(near, 1, [
      { r: baseline, text: 'no data' },
      { r: baseline + R * 0.09, text: '30 min way to work' },
      { r: baseline + R * 0.18, text: '40 min' },
      { r: baseline + R * 0.27, text: '50 min' },
    ]);
    expect(anyOverlap(boxesOf(placed))).toBe(false);
    expect(labelsPastTips(1, placed)).toBe(true);
  });

  it('keeps tight unemployment marks clear and past their tips', () => {
    const R = 220;
    const marks = ringMarks(R * 0.66, R * theme.donut.shadowStep);
    for (const near of [Math.PI / 2, Math.PI, -2.2]) {
      const placed = place(near, -1, marks);
      expect(anyOverlap(boxesOf(placed))).toBe(false);
      expect(labelsPastTips(-1, placed)).toBe(true);
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

  it('reverses Lyon unemployment (top-left) and keeps commute outer-long', () => {
    const cities = dataset.cities.filter((city) => city.country === 'FR');
    const R = selectionRadius(900, true);
    const g = donutLayout([{ countryId: 'FR', cities }], { cx: center.x, cy: center.y, R });
    const seg = g.segments.find((s) => s.cityId === 'lyon');
    expect(seg).toBeTruthy();

    const unempNear = seg!.a0 - theme.donut.gap;
    expect(reverseStaircase(unempNear, -1)).toBe(true);

    const step = g.R * theme.donut.shadowStep;
    const unemployment = place(unempNear, -1, [
      { r: seg!.r1, text: LEGEND.noData },
      { r: seg!.r1 + step * UNEMPLOYMENT_STEPS.low, text: formatRate(5) },
      { r: seg!.r1 + step * UNEMPLOYMENT_STEPS.medium, text: formatRate(9) },
      { r: seg!.r1 + step * UNEMPLOYMENT_STEPS.high, text: formatRate(13) },
    ]);
    const commuteNear = seg!.a1 + theme.donut.gap;
    const commute = place(commuteNear, 1, [
      { r: commuteRadius(g.R, null), text: LEGEND.noData },
      { r: g.guides[0]!.r, text: '30 min way to work' },
      { r: g.guides[1]!.r, text: '40 min' },
      { r: g.guides[2]!.r, text: '50 min' },
    ]);

    const unempByR = [...unemployment].sort((a, b) => a.r - b.r);
    for (let i = 1; i < unempByR.length; i++) {
      expect(unempByR[i]!.pixelLength).toBeLessThan(unempByR[i - 1]!.pixelLength);
    }
    const commuteByR = [...commute].sort((a, b) => a.r - b.r);
    for (let i = 1; i < commuteByR.length; i++) {
      expect(commuteByR[i]!.pixelLength).toBeGreaterThan(commuteByR[i - 1]!.pixelLength);
    }
    expect(anyOverlap(boxesOf(unemployment))).toBe(false);
    expect(anyOverlap(boxesOf(commute))).toBe(false);
    expect(labelsPastTips(-1, unemployment)).toBe(true);
    expect(labelsPastTips(1, commute)).toBe(true);
  });

  it('stays clear for every Austria city on a focus donut', () => {
    const cities = dataset.cities.filter((city) => city.country === 'AT');
    const R = selectionRadius(900, true);
    const g = donutLayout([{ countryId: 'AT', cities }], { cx: 600, cy: 480, R });
    for (const seg of g.segments) {
      const step = g.R * theme.donut.shadowStep;
      const unempNear = seg.a0 - theme.donut.gap;
      const unemployment = place(unempNear, -1, [
        { r: seg.r1, text: LEGEND.noData },
        { r: seg.r1 + step * UNEMPLOYMENT_STEPS.low, text: formatRate(5) },
        { r: seg.r1 + step * UNEMPLOYMENT_STEPS.medium, text: formatRate(9) },
        { r: seg.r1 + step * UNEMPLOYMENT_STEPS.high, text: formatRate(13) },
      ]);
      const commuteNear = seg.a1 + theme.donut.gap;
      const commute = place(commuteNear, 1, [
        { r: commuteRadius(g.R, null), text: LEGEND.noData },
        ...g.guides.map((guide) => ({ r: guide.r, text: `${guide.minutes} min` })),
      ]);
      expect(anyOverlap(boxesOf(unemployment))).toBe(false);
      expect(anyOverlap(boxesOf(commute))).toBe(false);
      expect(labelsPastTips(-1, unemployment)).toBe(true);
      expect(labelsPastTips(1, commute)).toBe(true);
    }
  });
});
