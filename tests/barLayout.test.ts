import { describe, expect, it } from 'vitest';
import { introFrame } from '../src/config/introFrame';
import { theme } from '../src/config/theme';
import { barLayout, commuteSlideLayout } from '../src/canvas/layout/barLayout';
import { viewportFor } from '../src/canvas/scenes/Scene';
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
  const anchorX = theme.intro.box.x + theme.intro.box.w / 2;

  it('matches the Figma frame exactly at the design size', () => {
    expect(introFrame(1536, 960)).toEqual({ scale: 1, ox: 0, oy: 0 });
  });

  it('scales to fit and keeps the artboard on screen', () => {
    expect(introFrame(768, 960)).toMatchObject({ scale: 0.5, ox: 0 });
    expect(introFrame(768, 960).oy).toBeCloseTo(264.25);
    expect(introFrame(1536, 480)).toMatchObject({ scale: 0.5, oy: 0 });
    expect(introFrame(1536, 480).ox).toBeCloseTo(415.5);
    expect(introFrame(1920, 1080)).toMatchObject({ scale: 1.125, oy: 0 });
    expect(introFrame(1920, 1080).ox).toBeCloseTo(166.875);
  });

  it('puts the story in the middle of a larger screen', () => {
    const frame = introFrame(2560, 1440);
    expect(frame.ox + anchorX * frame.scale).toBeCloseTo(1280);
    expect(frame.oy).toBe(0);
  });

  it('grows the sidebar inset with the same scale', () => {
    const scale = introFrame(2560, 1440).scale;
    const left = (theme.layout.stripWidth + theme.layout.panelWidth) * scale;
    expect(viewportFor('explore', 2560, 1440)).toEqual({
      x: left,
      y: 0,
      w: 2560 - left,
      h: 1440,
    });
    expect(viewportFor('intro', 2560, 1440).x).toBe(theme.layout.stripWidth * scale);
    expect(viewportFor('landing', 2560, 1440).x).toBe(0);
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

  it('slides only the rectangle; the stage legend stays put', () => {
    const rest = barLayout(city, 'unemployment');
    const lifted = barLayout(city, 'commute');
    const labels = (t: number, figure: 'unemployment' | 'commute') =>
      commuteSlideLayout(city, figure, t).callouts.map((line) => line.label);

    expect(commuteSlideLayout(city, 'commute', 0).box).toEqual(rest.box);
    expect(commuteSlideLayout(city, 'commute', 1).box).toEqual(lifted.box);
    expect(commuteSlideLayout(city, 'commute', 0.5).box.y).toBeCloseTo(
      (rest.box.y + lifted.box.y) / 2,
    );

    expect(labels(0, 'commute')).toEqual(labels(1, 'commute'));
    expect(labels(0.5, 'commute')).toEqual(lifted.callouts.map((line) => line.label));
    expect(labels(0.5, 'commute')).not.toContain('low');
    expect(commuteSlideLayout(city, 'commute', 0.5).shadow).toBe(0);
    expect(commuteSlideLayout(city, 'commute', 0.5).scaleArrows).toEqual(lifted.scaleArrows);

    const back = commuteSlideLayout(city, 'unemployment', 0.5);
    expect(back.box.y).toBeCloseTo((rest.box.y + lifted.box.y) / 2);
    expect(back.callouts.map((line) => line.label)).toEqual(
      rest.callouts.map((line) => line.label),
    );
    expect(back.shadow).toBe(rest.shadow);
    expect(back.scaleArrows).toEqual([]);

    for (const label of ['50 min', '40 min', '30 min', 'no data']) {
      const yAt = (t: number) =>
        commuteSlideLayout(city, 'commute', t).callouts.find((line) => line.label === label)?.y;
      expect(yAt(0)).toBe(yAt(1));
    }
  });
});
