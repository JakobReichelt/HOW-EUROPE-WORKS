import { describe, expect, it } from 'vitest';
import {
  approach,
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  progress,
} from '../src/canvas/anim/tween';
import { wordAlphas } from '../src/canvas/anim/wordReveal';

describe('tween', () => {
  it('clamps and eases within 0..1', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it('reports progress and lerps', () => {
    expect(progress(100, 100, 400)).toBe(0);
    expect(progress(100, 300, 400)).toBeCloseTo(0.5);
    expect(progress(100, 500, 400)).toBe(1);
    expect(progress(0, 10, 0)).toBe(1);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it('approaches a target and settles', () => {
    let v = 0;
    for (let i = 0; i < 40; i++) v = approach(v, 1, 16, 160);
    expect(v).toBe(1);
    expect(approach(0.5, 0.5, 16, 160)).toBe(0.5);
    expect(approach(0, 1, 16, 0)).toBe(1);
  });
});

describe('wordAlphas', () => {
  it('staggers words and fades each in', () => {
    expect(wordAlphas(3, 0, 55, 180)).toEqual([0, 0, 0]);
    expect(wordAlphas(3, 55, 55, 180)[0]).toBeGreaterThan(0);
    expect(wordAlphas(3, 55, 55, 180)[1]).toBe(0);
    expect(wordAlphas(3, 55 + 180, 55, 180)[0]).toBe(1);
    expect(wordAlphas(2, 1000, 55, 180)).toEqual([1, 1]);
    expect(wordAlphas(2, 10, 0, 0)).toEqual([1, 1]);
  });
});
