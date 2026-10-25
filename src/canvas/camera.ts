/**
 * 2D camera for the explore canvas. (x, y) is the world point shown at the centre of the viewport.
 */
import type p5 from 'p5';
import { theme } from '../config/theme';
import { clamp, type Point, type Rect } from './geometry';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

export function worldToScreen(cam: Camera, vp: Rect, p: Point): Point {
  return {
    x: vp.x + vp.w / 2 + (p.x - cam.x) * cam.zoom,
    y: vp.y + vp.h / 2 + (p.y - cam.y) * cam.zoom,
  };
}

export function screenToWorld(cam: Camera, vp: Rect, p: Point): Point {
  return {
    x: cam.x + (p.x - vp.x - vp.w / 2) / cam.zoom,
    y: cam.y + (p.y - vp.y - vp.h / 2) / cam.zoom,
  };
}

/** Move the camera so the content follows a screen-space drag of (dx, dy). */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom };
}

/**
 * Camera that shows `world` at `screen`, with `worldSpan` world units covering
 * `screenSpan` pixels. Zoom is clamped; the world point stays on the screen point.
 */
export function framePoint(
  world: Point,
  worldSpan: number,
  screen: Point,
  screenSpan: number,
  vp: Rect,
): Camera {
  const zoom = clamp(screenSpan / Math.max(worldSpan, 1e-6), theme.zoom.min, theme.zoom.max);
  const originX = vp.x + vp.w / 2;
  const originY = vp.y + vp.h / 2;
  return {
    zoom,
    x: world.x - (screen.x - originX) / zoom,
    y: world.y - (screen.y - originY) / zoom,
  };
}

/** Zoom that fits `bounds` in `vp` with `padding` screen pixels on each side. */
export function fitZoom(bounds: Rect, vp: Rect, padding: number = theme.zoom.fitPadding): number {
  const aw = Math.max(vp.w - padding * 2, 1);
  const ah = Math.max(vp.h - padding * 2, 1);
  return Math.min(aw / Math.max(bounds.w, 1e-6), ah / Math.max(bounds.h, 1e-6));
}

/** Zoom by `factor`, keeping the world point under `screen` fixed. */
export function zoomAt(
  cam: Camera,
  vp: Rect,
  screen: Point,
  factor: number,
  limits: ZoomLimits = { min: theme.zoom.min, max: theme.zoom.max },
): Camera {
  const zoom = clamp(cam.zoom * factor, limits.min, limits.max);
  const anchor = screenToWorld(cam, vp, screen);
  return {
    zoom,
    x: anchor.x - (screen.x - vp.x - vp.w / 2) / zoom,
    y: anchor.y - (screen.y - vp.y - vp.h / 2) / zoom,
  };
}

export function fitCamera(bounds: Rect, vp: Rect, padding: number = theme.zoom.fitPadding): Camera {
  const zoom = Math.min(fitZoom(bounds, vp, padding), theme.zoom.max);
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, zoom };
}

export function applyCamera(p: p5, cam: Camera, vp: Rect): void {
  p.translate(vp.x + vp.w / 2, vp.y + vp.h / 2);
  p.scale(cam.zoom);
  p.translate(-cam.x, -cam.y);
}
