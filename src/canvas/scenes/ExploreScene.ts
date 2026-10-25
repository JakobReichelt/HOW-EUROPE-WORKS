/**
 * Explore canvas (Figma 347:6230, 230:10924, 360:2397, 360:5355, 393:8528).
 *   selection.length === 0  overview: every country donut in world space, pan / zoom / drag a donut or a city
 *   selection.length === 1  focus: one country or one city centred in the viewport
 *   selection.length >= 2   combined: one donut of the selected countries and cities, with brackets
 */
import { legendUnemploymentPercents } from '../../config/encoding';
import { theme } from '../../config/theme';
import { INTRO_COUNTRY_ID, INTRO_STEPS } from '../../content/intro';
import { citiesOf, type DataIndex } from '../../data/selectors';
import { encodeSelection } from '../../state/selection';
import type { SceneId, SelectionPart } from '../../state/types';
import {
  applyCamera,
  fitCamera,
  fitZoom,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
} from '../camera';
import { drawDonut, drawDonutText, drawSegment } from '../draw/donut';
import { blitDonut, DonutPictures } from '../draw/donutPicture';
import { defaultLegendSegment, drawLegend, drawVeil } from '../draw/legend';
import { ctx2d } from '../draw/shapes';
import { hitDonut, hitDonuts, type Hit } from '../hit/hitTest';
import {
  citySegmentCenter,
  donutLayout,
  selectionRadius,
  type DonutGeometry,
  type DonutGroup,
} from '../layout/donutLayout';
import { worldBounds, worldLayout, type WorldNode } from '../layout/worldLayout';
import { rectCenter, type Point, type Rect } from '../geometry';
import {
  cameraMatchingIntro,
  cameraMatchingSelection,
  countryLabelTextScale,
  donutTextScale,
  selectionAnchor,
  selectionHasBrackets,
} from '../view/handoff';
import { circleHitsViewport, detailLevel } from '../view/visibility';
import type { PointerInput, Scene, SceneContext } from './Scene';

export type ExploreMode = 'overview' | 'focus' | 'combined';

export function exploreMode(selection: readonly SelectionPart[]): ExploreMode {
  if (selection.length === 0) return 'overview';
  return selection.length === 1 ? 'focus' : 'combined';
}

const CLICK_TOLERANCE = 4;
const KEY_PAN = 60;

interface DragGrab {
  countryId: string;
  /** World-space offset from the dragged centre to the pointer at grab time. */
  grab: Point;
}

interface DragCountry extends DragGrab {
  kind: 'country';
}

interface DragCity extends DragGrab {
  kind: 'city';
  cityId: string;
}

type Drag = DragCountry | DragCity;

interface PointerSession {
  start: Point;
  last: Point;
  moved: boolean;
  /** Donut or city being dragged. Null pans the camera. */
  drag: Drag | null;
}

/** Zoom at which world units match the Figma artboard for this viewport. */
function designZoom(vp: Rect): number {
  const { width, height } = theme.layout.design;
  const sidebar = theme.layout.stripWidth + theme.layout.panelWidth;
  return Math.min(vp.w / (width - sidebar), vp.h / height);
}

export class ExploreScene implements Scene {
  private readonly nodes: WorldNode[];
  /** Overview donuts in world coordinates. Static, computed once. */
  private readonly worldGeoms: DonutGeometry[];
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private cameraReady = false;
  private session: PointerSession | null = null;
  private pointer: Point | null = null;
  private dropTarget: string | null = null;
  /** City the open legend explains. Stays until another segment is hovered or the legend closes. */
  private legendPin: { countryId: string; cityId: string } | null = null;
  /** Zoom the country pictures were baked at. Lags the camera during a wheel gesture. */
  private bakedZoom = 1;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private pictures: DonutPictures | null = null;
  private viewFocusNonce = -1;
  /** Selection drawn last this visit. Null until the first draw after enter. */
  private shownSelection: readonly SelectionPart[] | null = null;

  constructor(
    data: DataIndex,
    private readonly requestRedraw: () => void,
  ) {
    this.nodes = worldLayout(data.countries, data.dataset.cities);
    this.worldGeoms = this.nodes.map((n) =>
      donutLayout([{ countryId: n.countryId, cities: citiesOf(data, n.countryId) }], {
        cx: n.x,
        cy: n.y,
        R: n.R,
      }),
    );
  }

  destroy(): void {
    this.clearSettle();
    this.pictures?.destroy();
    this.pictures = null;
  }

  enter(ctx: SceneContext, from?: SceneId | null): void {
    this.session = null;
    this.dropTarget = null;
    this.shownSelection = null;
    // Finish intro (donut step) and "skip intro" both open on Switzerland at the intro pose.
    const fromIntroDonut = from === 'intro' && INTRO_STEPS[ctx.state.introStep]?.figure === 'donut';
    if (fromIntroDonut || from === 'landing') {
      const node = this.nodes.find((n) => n.countryId === INTRO_COUNTRY_ID);
      if (node) {
        this.camera = cameraMatchingIntro(
          node,
          { width: ctx.p.width, height: ctx.p.height },
          ctx.viewport,
        );
        this.cameraReady = true;
        this.snapZoom();
        return;
      }
    }
    if (!this.cameraReady) this.resetCamera(ctx);
  }

  /** Figma first view: design scale, centred on world.initialCountry. */
  resetCamera(ctx: SceneContext): void {
    const node =
      this.nodes.find((n) => n.countryId === theme.world.initialCountry) ?? this.nodes[0];
    this.camera = { x: node?.x ?? 0, y: node?.y ?? 0, zoom: designZoom(ctx.viewport) };
    this.cameraReady = true;
    this.snapZoom();
  }

  draw(ctx: SceneContext): void {
    this.handoffSelection(ctx);
    this.applyViewFocus(ctx);
    if (exploreMode(ctx.state.selection) === 'overview') this.clampOverviewZoom(ctx);
    const pictures = this.ensurePictures(ctx.p);
    pictures.beginFrame();
    if (exploreMode(ctx.state.selection) === 'overview') this.drawOverview(ctx);
    else this.drawSelection(ctx);
    pictures.endFrame();
    if (ctx.state.legendOpen) this.drawLegendOverlay(ctx);
    else this.legendPin = null;
  }

  /** Furthest overview zoom-out: every country donut visible with edge padding. */
  private overviewZoomLimits(ctx: SceneContext): { min: number; max: number } {
    return {
      min: fitZoom(worldBounds(this.nodes), ctx.viewport, theme.zoom.fitPadding),
      max: theme.zoom.max,
    };
  }

  private clampOverviewZoom(ctx: SceneContext): void {
    const { min, max } = this.overviewZoomLimits(ctx);
    const zoom = Math.min(Math.max(this.camera.zoom, min), max);
    if (zoom === this.camera.zoom) return;
    this.camera = { ...this.camera, zoom };
    this.snapZoom();
  }

  // ---- drawing ----------------------------------------------------------------------------

  private groupLabel(ctx: SceneContext) {
    return (id: string) => ctx.data.countryById.get(id)?.name ?? id;
  }

  private ensurePictures(p: SceneContext['p']): DonutPictures {
    if (!this.pictures) this.pictures = new DonutPictures(p);
    return this.pictures;
  }

  /** Selection donut radius: the screen size whose type is theme.font. */
  private focusRadius(ctx: SceneContext): number {
    const minSide = Math.min(ctx.viewport.w, ctx.viewport.h);
    return selectionRadius(minSide, false);
  }

  private bodyStyle(
    ctx: SceneContext,
    zoom: number,
    detail: ReturnType<typeof detailLevel>,
    label: string | null,
    textScale = 1,
    labelScale?: number,
  ) {
    return {
      lineScale: 1 / zoom,
      zoom,
      detail,
      textScale,
      labelScale,
      sectorFilter: ctx.state.sectorFilter,
      label,
      groupLabel: this.groupLabel(ctx),
    };
  }

  /** Blit a baked donut, or draw it live when the picture is missing or over the size cap. */
  private paintCached(
    ctx: SceneContext,
    g: DonutGeometry,
    id: string,
    zoom: number,
    bakedZoom: number,
    label: string | null,
    textScale = 1,
    labelScale?: number,
  ): void {
    const pic = this.ensurePictures(ctx.p).pictureFor({
      id,
      geom: g,
      zoom,
      bakedZoom,
      sectorFilter: ctx.state.sectorFilter,
      detail: detailLevel(g.R * bakedZoom),
      label,
      groupLabel: this.groupLabel(ctx),
    });
    const style = this.bodyStyle(ctx, zoom, detailLevel(g.R * zoom), label, textScale, labelScale);
    if (pic) {
      blitDonut(ctx.p, pic, g);
      drawDonutText(ctx.p, g, style);
    } else drawDonut(ctx.p, g, style);
  }

  private snapZoom(): void {
    this.clearSettle();
    this.bakedZoom = this.camera.zoom;
  }

  private scheduleSettle(): void {
    this.clearSettle();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.bakedZoom === this.camera.zoom) return;
      this.bakedZoom = this.camera.zoom;
      this.requestRedraw();
    }, theme.canvas.zoomSettleMs);
  }

  private clearSettle(): void {
    if (this.settleTimer === null) return;
    clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  /**
   * Focus and compare draw one donut in the viewport. Closing the selection
   * opens the map with that donut still at the same place and size.
   */
  private handoffSelection(ctx: SceneContext): void {
    const next = ctx.state.selection;
    const previous = this.shownSelection;
    this.shownSelection = next;
    if (!previous || previous.length === 0 || next.length > 0) return;
    const cityCountry = (id: string) => ctx.data.cityById.get(id)?.country;
    const anchor = selectionAnchor(previous, this.nodes, cityCountry);
    if (!anchor) return;
    this.camera = cameraMatchingSelection(
      anchor,
      ctx.viewport,
      selectionHasBrackets(previous, cityCountry),
    );
    this.cameraReady = true;
    this.snapZoom();
  }

  /** Pan the overview so the requested country or city sits in the centre. */
  private applyViewFocus(ctx: SceneContext): void {
    const focus = ctx.state.viewFocus;
    if (!focus || focus.nonce === this.viewFocusNonce) return;
    this.viewFocusNonce = focus.nonce;
    if (exploreMode(ctx.state.selection) !== 'overview') return;

    if (focus.kind === 'country') {
      const node = this.nodes.find((n) => n.countryId === focus.id);
      if (!node) return;
      this.camera = { ...this.camera, x: node.x, y: node.y };
      return;
    }

    const city = ctx.data.cityById.get(focus.id);
    if (!city) return;
    const geom = this.worldGeoms.find((g) => g.countryIds[0] === city.country);
    if (!geom) return;
    const pt = citySegmentCenter(geom, focus.id);
    if (!pt) return;
    this.camera = { ...this.camera, x: pt.x, y: pt.y };
  }

  private drawOverview(ctx: SceneContext): void {
    const { p, state, data } = ctx;
    const zoom = this.camera.zoom;
    const focusR = this.focusRadius(ctx);
    const drag = this.session?.moved ? this.session.drag : null;
    const pictures = this.ensurePictures(p);
    // Centre labels grow as 1/zoom when zoomed out; pad culls so they are not clipped.
    const labelPad = Math.max(theme.canvas.labelPad, (theme.font.s * 6) / zoom);

    p.push();
    applyCamera(p, this.camera, ctx.viewport);
    for (const g of this.worldGeoms) {
      const countryId = g.countryIds[0] ?? '';
      const id = `world:${countryId}`;
      const label = data.countryById.get(countryId)?.name ?? countryId;
      const textScale = donutTextScale(g.R, focusR);
      const labelScale = countryLabelTextScale(g.R, focusR, zoom);
      if (drag?.kind === 'country' && countryId === drag.countryId) {
        pictures.retain(id);
      } else if (drag?.kind === 'city' && countryId === drag.countryId) {
        pictures.retain(id);
        drawDonut(p, g, {
          ...this.bodyStyle(ctx, zoom, detailLevel(g.R * zoom), label, textScale, labelScale),
          omitCityId: drag.cityId,
        });
      } else if (!circleHitsViewport(this.camera, ctx.viewport, g.cx, g.cy, g.outer, labelPad)) {
        continue;
      } else {
        const hovered = state.hover.countryId === countryId;
        if (hovered) {
          pictures.retain(id);
          drawDonut(p, g, {
            ...this.bodyStyle(ctx, zoom, detailLevel(g.R * zoom), label, textScale, labelScale),
            hoverCityId: state.hover.cityId,
            hoverCountry: state.hover.cityId === null,
          });
        } else {
          this.paintCached(ctx, g, id, zoom, this.bakedZoom, label, textScale, labelScale);
        }
      }
      if (countryId === this.dropTarget) {
        p.noFill();
        p.stroke(theme.color.ink);
        p.strokeWeight(theme.stroke.hover / zoom);
        p.circle(g.cx, g.cy, g.R * theme.donut.groupRing * 2);
      }
    }

    if (drag?.kind === 'country') this.drawLiftedCountry(ctx, drag);
    if (drag?.kind === 'city') this.drawLiftedCity(ctx, drag);
    p.pop();
  }

  /** Whole country donut following the pointer. */
  private drawLiftedCountry(ctx: SceneContext, drag: DragCountry): void {
    if (!this.pointer) return;
    const geom = this.worldGeoms.find((g) => g.countryIds[0] === drag.countryId);
    if (!geom) return;
    const at = screenToWorld(this.camera, ctx.viewport, this.pointer);
    const zoom = this.camera.zoom;
    const { p } = ctx;
    p.push();
    p.translate(at.x - drag.grab.x - geom.cx, at.y - drag.grab.y - geom.cy);
    const focusR = this.focusRadius(ctx);
    drawDonut(p, geom, {
      ...this.bodyStyle(
        ctx,
        zoom,
        detailLevel(geom.R * zoom),
        ctx.data.countryById.get(drag.countryId)?.name ?? null,
        donutTextScale(geom.R, focusR),
        countryLabelTextScale(geom.R, focusR, zoom),
      ),
      alpha: 0.8,
    });
    p.pop();
  }

  /** City segment following the pointer, torn out of its country donut. */
  private drawLiftedCity(ctx: SceneContext, drag: DragCity): void {
    if (!this.pointer) return;
    const geom = this.worldGeoms.find((g) => g.countryIds[0] === drag.countryId);
    const seg = geom?.segments.find((s) => s.cityId === drag.cityId);
    const center = geom ? citySegmentCenter(geom, drag.cityId) : null;
    if (!geom || !seg || !center) return;

    const at = screenToWorld(this.camera, ctx.viewport, this.pointer);
    const zoom = this.camera.zoom;
    const { p } = ctx;
    p.push();
    p.translate(at.x - drag.grab.x - center.x, at.y - drag.grab.y - center.y);
    ctx2d(p).globalAlpha = 0.8;
    drawSegment(p, geom, seg, {
      lineScale: 1 / zoom,
      textScale: donutTextScale(geom.R, this.focusRadius(ctx)),
      zoom,
      detail: detailLevel(geom.R * zoom),
      hoverCityId: null,
      hoverCountry: false,
      sectorFilter: ctx.state.sectorFilter,
      details: true,
    });
    ctx2d(p).globalAlpha = 1;
    p.pop();
  }

  /** One bracket per selected country or city, in selection order. */
  private selectionGroups(ctx: SceneContext): DonutGroup[] {
    const countries = new Set(
      ctx.state.selection.filter((part) => part.kind === 'country').map((part) => part.id),
    );
    return ctx.state.selection.flatMap((part) => this.partGroup(ctx, part, countries));
  }

  private partGroup(
    ctx: SceneContext,
    part: SelectionPart,
    countries: ReadonlySet<string>,
  ): DonutGroup[] {
    if (part.kind === 'country') {
      const country = ctx.data.countryById.get(part.id);
      if (!country) return [];
      return [{ countryId: part.id, label: country.name, cities: citiesOf(ctx.data, part.id) }];
    }
    const city = ctx.data.cityById.get(part.id);
    if (!city || countries.has(city.country)) return [];
    return [{ countryId: city.country, label: city.name, cities: [city], bracket: false }];
  }

  private selectionLabel(ctx: SceneContext): string | null {
    const [only] = ctx.state.selection;
    if (ctx.state.selection.length !== 1 || !only) return null;
    if (only.kind === 'country') return ctx.data.countryById.get(only.id)?.name ?? null;
    return ctx.data.cityById.get(only.id)?.name ?? null;
  }

  private selectionGeometry(ctx: SceneContext): DonutGeometry {
    const center = rectCenter(ctx.viewport);
    const groups = this.selectionGroups(ctx);
    const hasBrackets = groups.length > 1 && groups.some((group) => group.bracket !== false);
    const minSide = Math.min(ctx.viewport.w, ctx.viewport.h);
    return donutLayout(groups, {
      cx: center.x,
      cy: center.y,
      R: selectionRadius(minSide, hasBrackets),
    });
  }

  private drawSelection(ctx: SceneContext): void {
    const { state, p } = ctx;
    const g = this.selectionGeometry(ctx);
    const label = this.selectionLabel(ctx);
    const hoverCity = state.hover.cityId;
    const id = `view:${encodeSelection(state.selection)}:${Math.round(g.R)}`;
    if (hoverCity) {
      this.ensurePictures(p).retain(id);
      drawDonut(p, g, {
        ...this.bodyStyle(ctx, 1, detailLevel(g.R), label),
        hoverCityId: hoverCity,
      });
      return;
    }
    this.paintCached(ctx, g, id, 1, 1, label);
  }

  /**
   * Donut the legend explains. A hovered segment sticks until another one is hovered.
   * With nothing chosen yet, the donut nearest the centre.
   */
  private legendGeometry(ctx: SceneContext): DonutGeometry | null {
    if (exploreMode(ctx.state.selection) !== 'overview') return this.selectionGeometry(ctx);
    const center = screenToWorld(this.camera, ctx.viewport, rectCenter(ctx.viewport));
    const pinned = this.nodes.find((n) => n.countryId === this.legendPin?.countryId);
    const node =
      pinned ??
      this.nodes.reduce<WorldNode | null>(
        (best, n) =>
          !best ||
          Math.hypot(n.x - center.x, n.y - center.y) <
            Math.hypot(best.x - center.x, best.y - center.y)
            ? n
            : best,
        null,
      );
    if (!node) return null;
    const screen = worldToScreen(this.camera, ctx.viewport, node);
    return donutLayout(
      [{ countryId: node.countryId, cities: citiesOf(ctx.data, node.countryId) }],
      {
        cx: screen.x,
        cy: screen.y,
        R: node.R * this.camera.zoom,
      },
    );
  }

  private drawLegendOverlay(ctx: SceneContext): void {
    const { p, state } = ctx;
    p.resetMatrix();
    if (state.hover.cityId && state.hover.countryId) {
      this.legendPin = { countryId: state.hover.countryId, cityId: state.hover.cityId };
    }
    drawVeil(p, ctx.viewport);
    const g = this.legendGeometry(ctx);
    if (!g) return;
    const pinned = g.segments.find((s) => s.cityId === this.legendPin?.cityId);
    const seg = pinned ?? defaultLegendSegment(g);
    if (seg) {
      const cities = ctx.data.dataset.cities;
      drawLegend(
        p,
        g,
        seg,
        state.sectorFilter,
        {
          unemploymentPercent: legendUnemploymentPercents(
            cities.map((city) => ({ rate: city.unemploymentRate, level: city.unemploymentLevel })),
          ),
        },
        // Screen-space geom: same ratio as overview type (worldR/focusR * zoom).
        donutTextScale(g.R, this.focusRadius(ctx)),
      );
    }
  }

  // ---- input ------------------------------------------------------------------------------

  hitAt(ctx: SceneContext, screen: Point): Hit | null {
    if (exploreMode(ctx.state.selection) === 'overview') {
      const world = screenToWorld(this.camera, ctx.viewport, screen);
      return hitDonuts(this.worldGeoms, world.x, world.y);
    }
    return hitDonut(this.selectionGeometry(ctx), screen.x, screen.y);
  }

  pointerDown(ctx: SceneContext, e: PointerInput): boolean {
    if (ctx.state.legendOpen) {
      if (e.button !== 0) return true;
      this.session = {
        start: { x: e.x, y: e.y },
        last: { x: e.x, y: e.y },
        moved: false,
        drag: null,
      };
      return true;
    }
    if (e.button !== 0) return false;
    const overview = exploreMode(ctx.state.selection) === 'overview';
    const hit = this.hitAt(ctx, e);
    this.session = {
      start: { x: e.x, y: e.y },
      last: { x: e.x, y: e.y },
      moved: false,
      drag: overview && hit ? this.grab(ctx, hit, e) : null,
    };
    return false;
  }

  /**
   * A city segment rips that city out. The rest of the donut interior drags the country.
   * The grab offset keeps the piece under the pointer.
   */
  private grab(ctx: SceneContext, hit: Hit, at: Point): Drag | null {
    const geom = this.worldGeoms.find((g) => g.countryIds[0] === hit.countryId);
    if (!geom) return null;
    const world = screenToWorld(this.camera, ctx.viewport, at);
    if (hit.cityId) {
      const center = citySegmentCenter(geom, hit.cityId);
      if (!center) return null;
      return {
        kind: 'city',
        countryId: hit.countryId,
        cityId: hit.cityId,
        grab: { x: world.x - center.x, y: world.y - center.y },
      };
    }
    return {
      kind: 'country',
      countryId: hit.countryId,
      grab: { x: world.x - geom.cx, y: world.y - geom.cy },
    };
  }

  pointerMove(ctx: SceneContext, e: PointerInput): boolean {
    if (ctx.state.legendOpen) {
      this.pointer = { x: e.x, y: e.y };
      const s = this.session;
      if (!s) {
        const hit = this.hitAt(ctx, e);
        ctx.actions.setHover({ countryId: hit?.countryId ?? null, cityId: hit?.cityId ?? null });
        return false;
      }
      if (Math.hypot(e.x - s.start.x, e.y - s.start.y) > CLICK_TOLERANCE) s.moved = true;
      if (!s.moved) {
        const hit = this.hitAt(ctx, e);
        ctx.actions.setHover({ countryId: hit?.countryId ?? null, cityId: hit?.cityId ?? null });
        return false;
      }
      if (exploreMode(ctx.state.selection) === 'overview') {
        this.camera = panBy(this.camera, e.x - s.last.x, e.y - s.last.y);
        s.last = { x: e.x, y: e.y };
        return true;
      }
      return false;
    }
    this.pointer = { x: e.x, y: e.y };
    const s = this.session;
    if (!s) {
      const hit = this.hitAt(ctx, e);
      ctx.actions.setHover({ countryId: hit?.countryId ?? null, cityId: hit?.cityId ?? null });
      return false;
    }
    if (Math.hypot(e.x - s.start.x, e.y - s.start.y) > CLICK_TOLERANCE) s.moved = true;
    if (!s.moved) return false;

    if (s.drag) {
      const hit = this.hitAt(ctx, e);
      this.dropTarget = hit && hit.countryId !== s.drag.countryId ? hit.countryId : null;
    } else if (exploreMode(ctx.state.selection) === 'overview') {
      this.camera = panBy(this.camera, e.x - s.last.x, e.y - s.last.y);
    } else {
      return false;
    }
    s.last = { x: e.x, y: e.y };
    return true;
  }

  pointerUp(ctx: SceneContext, e: PointerInput): boolean {
    if (ctx.state.legendOpen) {
      const s = this.session;
      this.session = null;
      if (s && !s.moved) ctx.actions.toggleLegend(false);
      return true;
    }
    const s = this.session;
    this.session = null;
    if (!s) return false;

    if (s.drag && s.moved) {
      if (this.dropTarget) {
        if (s.drag.kind === 'city') {
          ctx.actions.selectCountryWithCity(this.dropTarget, s.drag.cityId);
        } else {
          ctx.actions.selectCountries([this.dropTarget, s.drag.countryId]);
        }
      }
      this.dropTarget = null;
      return true;
    }
    if (!s.moved) {
      const hit = this.hitAt(ctx, e);
      if (hit?.cityId) ctx.actions.selectCity(hit.cityId);
      else if (hit && exploreMode(ctx.state.selection) === 'overview') {
        ctx.actions.selectCountries([hit.countryId]);
      }
    }
    return false;
  }

  pointerLeave(ctx: SceneContext): boolean {
    if (ctx.state.legendOpen) {
      this.session = null;
      this.pointer = null;
      ctx.actions.setHover({ countryId: null, cityId: null });
      return false;
    }
    const ghost =
      this.session?.moved === true && this.session.drag !== null && this.pointer !== null;
    this.pointer = null;
    ctx.actions.setHover({ countryId: null, cityId: null });
    return ghost;
  }

  wheel(ctx: SceneContext, e: PointerInput & { deltaY: number }): boolean {
    if (exploreMode(ctx.state.selection) !== 'overview') return ctx.state.legendOpen;
    const factor = e.deltaY < 0 ? theme.zoom.wheelStep : 1 / theme.zoom.wheelStep;
    this.camera = zoomAt(this.camera, ctx.viewport, e, factor, this.overviewZoomLimits(ctx));
    this.scheduleSettle();
    return true;
  }

  key(ctx: SceneContext, key: string): boolean {
    if (ctx.state.legendOpen && key === 'Escape') {
      ctx.actions.toggleLegend(false);
      return true;
    }
    if (key === 'Escape') {
      ctx.actions.clearSelection();
      return true;
    }
    if (exploreMode(ctx.state.selection) !== 'overview') return ctx.state.legendOpen;
    const center = rectCenter(ctx.viewport);
    const limits = this.overviewZoomLimits(ctx);
    const moves: Record<string, () => Camera> = {
      ArrowLeft: () => panBy(this.camera, KEY_PAN, 0),
      ArrowRight: () => panBy(this.camera, -KEY_PAN, 0),
      ArrowUp: () => panBy(this.camera, 0, KEY_PAN),
      ArrowDown: () => panBy(this.camera, 0, -KEY_PAN),
      '+': () => zoomAt(this.camera, ctx.viewport, center, theme.zoom.wheelStep, limits),
      '-': () => zoomAt(this.camera, ctx.viewport, center, 1 / theme.zoom.wheelStep, limits),
      '0': () => fitCamera(worldBounds(this.nodes), ctx.viewport),
    };
    if (key === 'Home') {
      this.resetCamera(ctx);
      return true;
    }
    const move = moves[key];
    if (!move) return ctx.state.legendOpen;
    const before = this.camera.zoom;
    this.camera = move();
    if (this.camera.zoom !== before) this.snapZoom();
    return true;
  }

  describe(ctx: SceneContext): string {
    const mode = exploreMode(ctx.state.selection);
    if (mode === 'overview') return `Overview of ${this.nodes.length} country donuts`;
    const names = this.selectionGroups(ctx).map((group) => group.label ?? group.countryId);
    return `${mode === 'focus' ? 'Focus' : 'Combined'}: ${names.join(', ')}`;
  }

  inspect(ctx: SceneContext): unknown {
    return {
      mode: exploreMode(ctx.state.selection),
      camera: this.camera,
      viewport: ctx.viewport,
      nodes: this.nodes.map((n) => ({ ...n })),
    };
  }
}
