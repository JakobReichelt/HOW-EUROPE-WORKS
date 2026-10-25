/**
 * Offscreen snapshot of a static donut at one zoom and sector filter.
 * Hover, drag and the drop ring are drawn live by the scene, not baked here.
 * Pixel density stays 1 so a pan does not allocate a retina-sized buffer per country.
 */
import type p5 from 'p5';
import { theme } from '../../config/theme';
import type { SectorFilter } from '../../state/types';
import type { DonutGeometry } from '../layout/donutLayout';
import type { DetailLevel } from '../view/visibility';
import { drawDonut } from './donut';

export interface DonutPicture {
  key: string;
  /** Zoom the buffer was rasterized at. Blit scales when the camera zoom differs. */
  zoom: number;
  gfx: p5.Graphics;
  /** Buffer side in px at density 1. */
  side: number;
  sector: SectorFilter;
}

export interface PictureRequest {
  /** Stable id. Overview uses the country; focus uses the selection and radius. */
  id: string;
  geom: DonutGeometry;
  /** Camera zoom this frame (1 for a donut already in screen space). */
  zoom: number;
  /** Zoom pictures are allowed to bake at. Differs while a wheel gesture is settling. */
  bakedZoom: number;
  sectorFilter: SectorFilter;
  detail: DetailLevel;
  label: string | null;
  groupLabel: (countryId: string) => string;
}

interface Stored extends DonutPicture {
  detail: DetailLevel;
}

function pictureKey(req: PictureRequest): string {
  return [
    req.bakedZoom,
    req.sectorFilter ?? '',
    req.detail,
    req.label ?? '',
    req.geom.countryIds.join(','),
    req.geom.R,
    'screen-detail',
  ].join('|');
}

export class DonutPictures {
  private readonly pictures = new Map<string, Stored>();
  private readonly seen = new Set<string>();

  constructor(private readonly host: p5) {}

  beginFrame(): void {
    this.seen.clear();
  }

  /** Keep a picture alive this frame without rebuilding it (hovered or dragged donut). */
  retain(id: string): void {
    this.seen.add(id);
  }

  /**
   * Picture to blit, or null when the caller should draw live.
   * Rebuilds only when the camera zoom has settled on `bakedZoom` and the key missed.
   */
  pictureFor(req: PictureRequest): DonutPicture | null {
    this.seen.add(req.id);
    const existing = this.pictures.get(req.id);
    if (req.zoom !== req.bakedZoom) {
      return existing && existing.sector === req.sectorFilter ? existing : null;
    }
    const key = pictureKey(req);
    if (existing && existing.key === key) return existing;
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
    const side = Math.ceil((req.geom.outer + theme.canvas.labelPad) * 2 * zoom);
    if (side < 1 || side > theme.canvas.pictureMaxSide) {
      this.drop(req.id);
      return null;
    }

    let gfx = existing?.gfx;
    if (!gfx || existing?.side !== side) {
      if (gfx) this.dispose(gfx);
      const canvas = document.createElement('canvas');
      gfx = this.host.createGraphics(side, side, canvas);
      gfx.pixelDensity(1);
    }
    const g = req.geom;
    gfx.clear();
    gfx.push();
    gfx.textFont(theme.font.family);
    gfx.translate(side / 2, side / 2);
    gfx.scale(zoom);
    gfx.translate(-g.cx, -g.cy);
    drawDonut(gfx, g, {
      lineScale: 1 / zoom,
      zoom,
      detail: req.detail,
      sectorFilter: req.sectorFilter,
      hoverCityId: null,
      hoverCountry: false,
      label: null,
      groupLabel: req.groupLabel,
      details: false,
      alpha: 1,
    });
    gfx.pop();

    const stored: Stored = {
      key,
      zoom,
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
export function blitDonut(p: p5, pic: DonutPicture, g: DonutGeometry): void {
  const span = pic.side / pic.zoom;
  p.push();
  p.imageMode(p.CORNER);
  p.noTint();
  p.image(pic.gfx, g.cx - span / 2, g.cy - span / 2, span, span);
  p.pop();
}
