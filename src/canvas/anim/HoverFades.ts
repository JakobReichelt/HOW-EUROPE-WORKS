import { approach } from './tween';

const FRAME_MS = 16;
const MAX_STEP_MS = 40;

/**
 * Soft 0..1 values keyed by string (city:, country:, drop:).
 * Each frame `tick` eases every entry toward its target; settled zeros are dropped.
 */
export class HoverFades {
  private readonly values = new Map<string, number>();
  private readonly targets = new Map<string, number>();
  private lastMs = 0;

  setTarget(key: string, target: number): void {
    this.targets.set(key, target);
    if (!this.values.has(key)) this.values.set(key, 0);
  }

  /** Force every tracked key that is not in `active` toward 0. */
  setActive(active: ReadonlyMap<string, number>): void {
    for (const key of this.targets.keys()) {
      if (!active.has(key)) this.targets.set(key, 0);
    }
    for (const [key, target] of active) this.setTarget(key, target);
  }

  get(key: string): number {
    return this.values.get(key) ?? 0;
  }

  /** True while any value is still easing toward its target. */
  isAnimating(): boolean {
    for (const [key, value] of this.values) {
      const target = this.targets.get(key) ?? 0;
      if (value !== target) return true;
    }
    return false;
  }

  tick(nowMs: number, durationMs: number): void {
    // The canvas sleeps between changes; a long gap must not count as elapsed fade time,
    // or the first frame after an idle hover jumps ahead.
    const rawDt = nowMs - this.lastMs;
    const dt = this.lastMs === 0 || rawDt > MAX_STEP_MS ? FRAME_MS : Math.max(0, rawDt);
    this.lastMs = nowMs;
    for (const [key, value] of [...this.values]) {
      const target = this.targets.get(key) ?? 0;
      const next = approach(value, target, dt, durationMs);
      if (next === 0 && target === 0) {
        this.values.delete(key);
        this.targets.delete(key);
      } else {
        this.values.set(key, next);
      }
    }
  }

  clear(): void {
    this.values.clear();
    this.targets.clear();
    this.lastMs = 0;
  }
}
