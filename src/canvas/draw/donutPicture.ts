/**
 * Density-1 snapshots of city names and gender labels for a settled donut.
 * The ring and centre name are drawn live; hover / drag / morph stay fully live.
 * At most one buffer rebuilds per frame so a pan never pays every glyph at once.
 */
import type p5 from 'p5';
import { theme } from '../../config/theme';
import type { SectorFilter } from '../../state/types';
import type { DonutGeometry } from '../layout/donutLayout';
import type { DetailLevel } from '../view/visibility';
import { drawDonutText } from './donut';

export interface DonutPicture {
  key: string;
  /**
   * Scale used while rasterizing. Blit covers `side / zoom` world units.
   * Below the camera zoom when the buffer was capped.
   */
  zoom: number;
  gfx: p5.Graphics;
  /** Buffer side in CSS px (density 1). */
  side: number;
  sector: SectorFilter;
}

export interface PictureRequest {
  /** Stable id. Overview uses the country; focus uses the selection and radius. */
  id: string;
  geom: DonutGeometry;
  /** Camera zoom this frame (1 for a donut already in screen space). */
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
  groupLabel: (countryId: string) => string;
}

interface Stored extends DonutPicture {
  detail: DetailLevel;
}

function pictureKey(req: PictureRequest): string {
  const groups = req.geom.groups
    .map((group) => group.label ?? req.groupLabel(group.countryId))
    .join(',');
  return [
    req.bakedZoom,
    req.lineScale,
    req.genderScale,
    req.textScale,
    req.sectorFilter ?? '',
    req.detail,
    groups,
    req.geom.countryIds.join(','),
    req.geom.R,
    'labels-only',
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
    this.rebuildsLeft = 1;
    this.deferred = false;
  }

  /** Keep a picture alive this frame without rebuilding it (hovered or dragged donut). */
  retain(id: string): void {
    this.seen.add(id);
  }

  /** True when at least one visible donut still needs a fresh label buffer. */
  hasDeferred(): boolean {
    return this.deferred;
  }

  /**
   * Label picture to blit, or null when the caller should skip city labels this frame.
   * Rebuilds at most once per frame; other misses keep a stale buffer or wait.
   */
  pictureFor(req: PictureRequest): DonutPicture | null {
    this.seen.add(req.id);
    const existing = this.pictures.get(req.id);
    if (req.zoom !== req.bakedZoom) {
      return existing && existing.sector === req.sectorFilter ? existing : null;
    }
    const key = pictureKey(req);
    if (existing && existing.key === key) return existing;
    if (this.rebuildsLeft <= 0) {
      this.deferred = true;
      return existing && existing.sector === req.sectorFilter ? existing : null;
    }
    this.rebuildsLeft -= 1;
    return this.render(existing, req, key);
  }

  endFrame(): void {
    for (const id of this.pictures.keys()) {
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
  ): DonutPicture | null {
    const zoom = req.bakedZoom;
    const wanted = Math.ceil((req.geom.outer + theme.canvas.labelPad) * 2 * zoom);
    if (wanted < 1) {
      this.drop(req.id);
      return null;
    }
    const side = Math.min(wanted, theme.canvas.pictureMaxSide);
    const drawZoom = zoom * (side / wanted);

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
    gfx.scale(drawZoom);
    gfx.translate(-g.cx, -g.cy);
    drawDonutText(gfx, g, {
      lineScale: req.lineScale,
      genderScale: req.genderScale,
      textScale: req.textScale,
      zoom,
      detail: req.detail,
      sectorFilter: req.sectorFilter,
      label: null,
      groupLabel: req.groupLabel,
      details: true,
      alpha: 1,
    });
    gfx.pop();

    const stored: Stored = {
      key,
      zoom: drawZoom,
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
  const span = pic.side / pic.zoom;
  p.push();
  p.imageMode(p.CORNER);
  if (alpha < 1) {
    const ctx = p.drawingContext as CanvasRenderingContext2D;
    ctx.globalAlpha = alpha;
  } else {
    p.noTint();
  }
  p.image(pic.gfx, g.cx - span / 2, g.cy - span / 2, span, span);
  p.pop();
}
