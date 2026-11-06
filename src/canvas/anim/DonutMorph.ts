import { theme } from '../../config/theme';
import { interpolateDonut } from '../layout/donutTween';
import type { DonutGeometry } from '../layout/donutLayout';
import { easeInOutCubic, motionMs, progress } from './tween';

/** Timed morph between two donut layouts. Interruptible: start a new one from `current()`. */
export class DonutMorph {
  readonly from: DonutGeometry;
  readonly to: DonutGeometry;
  readonly startMs: number;
  readonly durationMs: number;

  constructor(from: DonutGeometry, to: DonutGeometry, startMs: number, durationMs?: number) {
    this.from = from;
    this.to = to;
    this.startMs = startMs;
    this.durationMs = motionMs(durationMs ?? theme.motion.segmentMs);
  }

  t(nowMs: number): number {
    return easeInOutCubic(progress(this.startMs, nowMs, this.durationMs));
  }

  current(nowMs: number): DonutGeometry {
    if (this.durationMs <= 0) return this.to;
    return interpolateDonut(this.from, this.to, this.t(nowMs));
  }

  done(nowMs: number): boolean {
    return progress(this.startMs, nowMs, this.durationMs) >= 1;
  }
}
