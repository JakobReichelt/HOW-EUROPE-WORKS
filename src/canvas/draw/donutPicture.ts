/**
 * Offscreen snapshots of settled donuts at native device-pixel resolution.
 * Hovered, dragged and morphing donuts are drawn live as vectors; settled donuts
 * blit from these 1:1 buffers so panning and hover fades never re-rasterize the map.
 */
import type p5 from 'p5';
import { theme } from '../../config/theme';
import type { SectorFilter } from '../../state/types';
import type { DonutGeometry } from '../layout/donutLayout';
import type { DetailLevel } from '../view/visibility';
import { drawDonut } from './donut';
import { ctx2d } from './shapes';

export interface DonutPicture {
  key: string;
  /** World-space width and height covered by the buffer (`(outer + labelPad) * 2`). */
  span: number;
  gfx: p5.Graphics;
  /** Buffer side in device pixels. */
  side: number;
  sector: SectorFilter;
}

export interface PictureRequest {
  /** Stable id. Overview uses `world:<countryId>`. */
  id: string;
  geom: DonutGeometry;
  /** Camera zoom this frame. */
  zoom: number;
  /** Stroke and detail scale baked into the buffer. 1 in world space under `zoom`. */
  lineScale: number;
  /** Gender tick scale baked into the buffer. Same units as `lineScale`. */
  genderScale: number;
  /** Type scale baked into the buffer. City names use it. */
  textScale: number;
  /** Zoom pictures are allowed to bake at. Differs from `zoom` while the camera is moving. */
  bakedZoom: number;
  sectorFilter: SectorFilter;
  detail: DetailLevel;
  label: string | null;
  groupLabel: (countryId: string) => string;
}

interface Stored extends DonutPicture {
  detail: DetailLevel;
}

function pictureKey(req: PictureRequest, density: number): string {
  const groups = req.geom.groups
    .map((group) => group.label ?? req.groupLabel(group.countryId))
    .join(',');
  return [
    req.bakedZoom.toFixed(4),
    density.toFixed(2),
    req.lineScale.toFixed(4),
    req.genderScale.toFixed(4),
    req.textScale.toFixed(4),
    req.sectorFilter ?? '',
    req.detail,
    req.label ?? '',
    groups,
    req.geom.countryIds.join(','),
    req.geom.R,
  ].join('|');
}

export class DonutPictures {
  private readonly pictures = new Map<string, Stored>();
  private readonly seen = new Set<string>();
  private rebuildsLeft = 0;
  private deferred = false;

  constructor(private readonly host: p5) {}

  beginFrame(): void {
    this.seen.clear();
    this.rebuildsLeft = 2;
    this.deferred = false;
  }

  /** Keep a picture alive this frame without rebuilding it (hovered or dragged donut). */
  retain(id: string): void {
    this.seen.add(id);
  }

  /** True when at least one visible donut still needs a fresh buffer. */
  hasDeferred(): boolean {
    return this.deferred;
  }

  /**
   * Picture to blit, or null when the caller should draw live this frame.
   * Rebuilds at most `rebuildsLeft` buffers per frame; other misses draw live vectors
   * until their turn so there is never a low-res or missing-label frame.
   */
  pictureFor(req: PictureRequest): DonutPicture | null {
    this.seen.add(req.id);
    const existing = this.pictures.get(req.id);
    if (req.zoom !== req.bakedZoom) {
      return existing && existing.sector === req.sectorFilter ? existing : null;
    }
    const density = this.host.pixelDensity();
    const key = pictureKey(req, density);
    if (existing && existing.key === key) return existing;
    if (this.rebuildsLeft <= 0) {
      this.deferred = true;
      return null;
    }
    this.rebuildsLeft -= 1;
    return this.render(existing, req, key, density);
  }

  endFrame(): void {
    // Keep world-space country buffers cached across pans and hover states.
    for (const id of this.pictures.keys()) {
      if (id.startsWith('world:')) continue;
      if (!this.seen.has(id)) this.drop(id);
    }
  }

  destroy(): void {
    for (const id of [...this.pictures.keys()]) this.drop(id);
    this.seen.clear();
  }

  private render(
    existing: Stored | undefined,
    req: PictureRequest,
    key: string,
    density: number,
  ): DonutPicture | null {
    const zoom = req.bakedZoom;
    const span = (req.geom.outer + theme.canvas.labelPad) * 2;
    const wanted = Math.ceil(span * zoom * density);
    if (wanted < 1) {
      this.drop(req.id);
      return null;
    }
    const side = Math.min(wanted, theme.canvas.pictureMaxSide);
    const drawScale = side / span;

    let gfx: p5.Graphics;
    if (existing && existing.side === side) {
      gfx = existing.gfx;
    } else {
      if (existing) this.dispose(existing.gfx);
      const canvas = document.createElement('canvas');
      gfx = this.host.createGraphics(side, side, canvas);
      gfx.pixelDensity(1);
    }
    const g = req.geom;
    gfx.clear();
    gfx.push();
    gfx.textFont(theme.font.family);
    gfx.translate(side / 2, side / 2);
    gfx.scale(drawScale);
    gfx.translate(-g.cx, -g.cy);
    drawDonut(gfx, g, {
      lineScale: req.lineScale,
      genderScale: req.genderScale,
      textScale: req.textScale,
      zoom,
      detail: req.detail,
      sectorFilter: req.sectorFilter,
      label: req.label,
      groupLabel: req.groupLabel,
      details: true,
      alpha: 1,
    });
    gfx.pop();

    const stored: Stored = {
      key,
      span,
      gfx,
      side,
      sector: req.sectorFilter,
      detail: req.detail,
    };
    this.pictures.set(req.id, stored);
    return stored;
  }

  private drop(id: string): void {
    const pic = this.pictures.get(id);
    if (!pic) return;
    this.pictures.delete(id);
    this.dispose(pic.gfx);
  }

  /**
   * p5.Graphics.remove() reads `_pInst._elements`, which is missing on a buffer
   * built from an external canvas, and that throw aborted the rest of the frame
   * (the legend never painted). Detach the canvas ourselves.
   */
  private dispose(gfx: p5.Graphics): void {
    const canvas = gfx.elt;
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    const elements = (this.host as p5 & { _elements?: p5.Element[] })._elements;
    if (!elements) return;
    const idx = elements.indexOf(gfx);
    if (idx !== -1) elements.splice(idx, 1);
  }
}

/** Draw a picture in the same space as `g` (world space under the camera, or screen space). */
export function blitDonut(p: p5, pic: DonutPicture, g: DonutGeometry, alpha = 1): void {
  const canvas = pic.gfx.elt as HTMLCanvasElement | undefined;
  if (!canvas) return;
  const span = pic.span;
  const ctx = ctx2d(p);
  const prevAlpha = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = prevAlpha * alpha;
  ctx.drawImage(canvas, g.cx - span / 2, g.cy - span / 2, span, span);
  if (alpha < 1) ctx.globalAlpha = prevAlpha;
}
