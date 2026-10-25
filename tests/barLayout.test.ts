import { describe, expect, it } from 'vitest';
import { introFrame } from '../src/config/introFrame';
import { theme } from '../src/config/theme';
import { barLayout } from '../src/canvas/layout/barLayout';
import { makeCity } from './fixtures';

const city = makeCity({
  id: 'zurich',
  name: 'Zurich',
  workingPeople: 408783,
  commuterRate: 0.32,
  maleShare: 0.53,
  unemploymentLevel: 'low',
  commuteMinutes: 40,
});

const box = theme.intro.box;

describe('intro frame', () => {
  it('uses design pixels when the window is the Figma frame or larger', () => {
    expect(introFrame(1536, 960)).toEqual({ scale: 1, ox: 0, oy: 0 });
    expect(introFrame(1920, 1080)).toEqual({ scale: 1, ox: 0, oy: 0 });
  });

  it('scales down to fit a smaller window', () => {
    expect(introFrame(768, 960).scale).toBeCloseTo(0.5);
    expect(introFrame(1536, 480).scale).toBeCloseTo(0.5);
  });
});

describe('intro bar', () => {
  it('places the box where the Figma frames place it', () => {
    expect(barLayout(city, 'people').box).toEqual(box);
  });

  it('brackets the whole box for working people and the hatch for commuters', () => {
    const people = barLayout(city, 'people');
    expect(people.bracket).toMatchObject({
      x0: box.x,
      x1: box.x + box.w - 1,
      y: box.y + box.h + theme.intro.bracket.peopleGap,
      strong: "408'783",
      rest: ' working people',
    });
    expect(people.hatchW).toBeNull();

    const commuters = barLayout(city, 'commuters');
    expect(commuters.hatchW).toBeCloseTo(box.w * 0.32);
    expect(commuters.bracket).toMatchObject({
      x0: box.x,
      x1: box.x + box.w * 0.32,
      y: box.y + box.h + theme.intro.bracket.commuterGap,
      strong: '32%',
    });
  });

  it('puts the gender divider at the male share and the low band on the box', () => {
    const gender = barLayout(city, 'gender');
    expect(gender.genderX).toBeCloseTo(box.x + box.w * 0.53);
    expect(gender.genderLabel?.rest).toBe('male');

    const unemployment = barLayout(city, 'unemployment');
    expect(unemployment.shadow).toBe(theme.intro.shadowStep);
    const low = unemployment.callouts.find((line) => line.label === 'low');
    const high = unemployment.callouts.find((line) => line.label === 'high');
    expect(low).toMatchObject({ y: box.y - theme.intro.levelOffset.low, labelMuted: false });
    expect(high).toMatchObject({ y: box.y - theme.intro.levelOffset.high, labelMuted: true });
  });

  it('lifts the commute bar, keeps the old 30 min floor, and marks no data', () => {
    const commute = barLayout(city, 'commute');
    const at = (label: string) => commute.callouts.find((line) => line.label === label);
    const lift = theme.intro.commuteLift;
    const bottom = box.y - lift + box.h;
    const oldFloor = box.y + box.h + 32;
    expect(commute.box.y).toBe(box.y - lift);
    expect(at('40 min')?.y).toBe(bottom);
    expect(at('50 min')?.y).toBe(bottom - 32);
    expect(at('30 min')?.y).toBe(bottom + 32);
    expect(at('no data')?.y).toBe(oldFloor);
    expect(at('40 min')).toMatchObject({ labelMuted: false, overBox: true });
    expect(at('30 min')).toMatchObject({ labelMuted: true, overBox: false });
    expect(at('no data')).toMatchObject({
      labelMuted: true,
      soft: true,
      tone: 'ink',
      overBox: false,
    });
    expect((at('40 min')?.x1 ?? 0) - (at('40 min')?.x0 ?? 0)).toBeGreaterThan(
      (at('30 min')?.x1 ?? 0) - (at('30 min')?.x0 ?? 0),
    );
    expect(commute.scaleArrows).toHaveLength(3);
    expect(commute.scaleArrows[0]).toMatchObject({
      x: commute.box.x + commute.box.w + theme.intro.scaleArrow.x,
    });

    const summary = barLayout(city, 'summary');
    expect(summary.box.y).toBe(box.y - lift);
    expect(summary.hatchW).not.toBeNull();
    expect(summary.genderX).not.toBeNull();
    expect(summary.shadow).toBe(theme.intro.shadowStep);
    expect(summary.bracket).toBeNull();
    expect(summary.scaleArrows).toHaveLength(0);
    expect(summary.callouts.every((line) => line.label === null)).toBe(true);
    expect(summary.callouts.some((line) => line.soft)).toBe(true);
    expect(
      summary.callouts.every(
        (line) => line.x1 - line.x0 === theme.intro.calloutInset + theme.intro.calloutPast,
      ),
    ).toBe(true);
  });
});
