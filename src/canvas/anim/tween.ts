/**
 * Shared easing and progress helpers for canvas motion.
 * Pure numbers in, numbers out. Scenes own start times and call requestRedraw while animating.
 */

/** Cubic ease-in-out. Flat at both ends so morphs do not jerk. */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Cubic ease-out. Fast leave, soft landing (drag snap-back). */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/** Linear progress from a start timestamp. Duration 0 jumps to 1. */
export function progress(startMs: number, nowMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return clamp01((nowMs - startMs) / durationMs);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Exponential approach of `current` toward `target` over roughly `durationMs`.
 * Used for hover mixes that retarget every frame.
 */
export function approach(
  current: number,
  target: number,
  dtMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0 || dtMs <= 0) return target;
  const lambda = 1 - Math.exp((-dtMs * Math.LN2 * 4) / durationMs);
  const next = current + (target - current) * lambda;
  if (Math.abs(target - next) < 0.001) return target;
  return next;
}

/** True when the user asked the OS to cut motion. Safe in Node tests (no window). */
export function reducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Duration that collapses to 0 under reduced motion. */
export function motionMs(ms: number): number {
  return reducedMotion() ? 0 : ms;
}
