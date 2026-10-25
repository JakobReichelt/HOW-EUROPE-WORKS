export const TAU = Math.PI * 2;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Angle mapped into [start, start + TAU). */
export function normalizeAngle(angle: number, start: number): number {
  let a = (angle - start) % TAU;
  if (a < 0) a += TAU;
  return start + a;
}

export function polar(cx: number, cy: number, r: number, angle: number): Point {
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
