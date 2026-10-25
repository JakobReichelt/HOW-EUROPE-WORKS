/**
 * What the camera can see, and how much detail that is worth drawing.
 * Pure: no p5. Screen radius is `R * zoom` (donut radius in screen px).
 */
import { theme } from '../../config/theme';
import { clamp, type Rect } from '../geometry';

export interface ViewCamera {
  x: number;
  y: number;
  zoom: number;
}

/** `mark` skips hatch and per-glyph labels. `full` is the current donut. */
export type DetailLevel = 'mark' | 'full';

/** World-space circle against the viewport. `pad` is extra world units (labels). */
export function circleHitsViewport(
  cam: ViewCamera,
  vp: Rect,
  cx: number,
  cy: number,
  r: number,
  pad = 0,
): boolean {
  const sx = vp.x + vp.w / 2 + (cx - cam.x) * cam.zoom;
  const sy = vp.y + vp.h / 2 + (cy - cam.y) * cam.zoom;
  const sr = (r + pad) * cam.zoom;
  const nx = clamp(sx, vp.x, vp.x + vp.w);
  const ny = clamp(sy, vp.y, vp.y + vp.h);
  const dx = sx - nx;
  const dy = sy - ny;
  return dx * dx + dy * dy <= sr * sr;
}

export function detailLevel(screenRadius: number): DetailLevel {
  return screenRadius >= theme.canvas.fullRadius ? 'full' : 'mark';
}
