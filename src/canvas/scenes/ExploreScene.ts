/**
 * Explore canvas (Figma 347:6230, 230:10924, 360:2397, 360:5355, 393:8528).
 *   selection.length === 0  overview: every country donut in world space, pan / drag a donut or a city
 *   selection.length === 1  focus: one country or one city centred in the viewport
 *   selection.length >= 2   combined: one donut of the selected countries and cities, with brackets
 *
 * Motion (scene-local): selection morphs, overview fade, hover easing, word reveal,
 * drag snap-back, drop morph. See theme.motion.
 */
import { legendUnemploymentPercents } from '../../config/encoding';
import { introDonutScreen, introFrame } from '../../config/introFrame';
import { theme } from '../../config/theme';
import { INTRO_COUNTRY_ID, INTRO_STEPS } from '../../content/intro';
import { citiesOf, type DataIndex } from '../../data/selectors';
import { encodeSelection } from '../../state/selection';
import type { SceneId, SelectionPart } from '../../state/types';
import { DonutMorph } from '../anim/DonutMorph';
import { HoverFades } from '../anim/HoverFades';
import { easeInOutCubic, easeOutCubic, lerp, motionMs, progress } from '../anim/tween';
import {
  applyCamera,
  framePoint,
  panBy,
  screenToWorld,
  wheelPan,
  worldToScreen,
  type Camera,
} from '../camera';
import { drawDonut, drawSegment } from '../draw/donut';
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
import { interpolateDonut, mapDonut } from '../layout/donutTween';
import { worldLayout, type WorldNode } from '../layout/worldLayout';
import { rectCenter, type Point, type Rect } from '../geometry';
import {
  cameraMatchingIntro,
  cameraMatchingSelection,
  selectionAnchor,
  selectionHasBrackets,
  selectionTargetCountry,
} from '../view/handoff';
import { circleHitsViewport, detailLevel } from '../view/visibility';
import type { PointerInput, Scene, SceneContext, WheelInput } from './Scene';

export type ExploreMode = 'overview' | 'focus' | 'combined';

export function exploreMode(selection: readonly SelectionPart[]): ExploreMode {
  if (selection.length === 0) return 'overview';
  return selection.length === 1 ? 'focus' : 'combined';
}

const CLICK_TOLERANCE = 4;
const KEY_PAN = 60;

/** Zoom at which world units match the Figma artboard for this viewport. */
function designZoom(vp: Rect): number {
  const { width, height } = theme.layout.design;
  const sidebar = theme.layout.stripWidth + theme.layout.panelWidth;
  return Math.min(vp.w / (width - sidebar), vp.h / height);
}

/** Fixed overview zoom. Further out than the Figma close view. */
const OVERVIEW_ZOOM = 0.6;

function overviewZoom(vp: Rect): number {
  return designZoom(vp) * OVERVIEW_ZOOM;
}

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

interface DragReturn {
  drag: Drag;
  /** World offset of the lifted piece from its home at release. */
  fromOffset: Point;
  startMs: number;
}

interface DropGhost {
  drag: Drag;
  offset: Point;
  startMs: number;
}

type TransitionKind = 'enter-selection' | 'leave-selection' | 'selection';

interface Transition {
  kind: TransitionKind;
  morph: DonutMorph;
  /** Country whose overview donut is the morph anchor (hidden from the faded map). */
  anchorId: string | null;
  /** Camera pan to the selected country before the enter-selection fade and morph begin. */
  cameraPan?: {
    from: Point;
    to: Point;
    startMs: number;
    durationMs: number;
  };
  /** Follow-up morph and overview fade-in after the deselect segment animation finishes. */
  nextMorph?: DonutMorph;
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
  /** Zoom the country pictures were baked at. */
  private bakedZoom = 1;
  private pictures: DonutPictures | null = null;
  private viewFocusNonce = -1;
  /** Selection drawn last this visit. Null until the first draw after enter. */
  private shownSelection: readonly SelectionPart[] | null = null;
  private shownKey: string | null = null;
  private shownGeom: DonutGeometry | null = null;
  private transition: Transition | null = null;
  private readonly hoverFades = new HoverFades();
  private hoverRevealCity: string | null = null;
  private hoverRevealStart = 0;
  private returning: DragReturn | null = null;
  private dropGhost: DropGhost | null = null;
  /** Dropped country or city kept hidden on the canvas until leaving selection mode. */
  private droppedDrag: Drag | null = null;
  /** Next selection morph should start from this country's overview donut (drop target). */
  private pendingDropAnchor: string | null = null;
  /**
   * Skip the deselect camera reframe once. Used when leaving the intro donut: the camera
   * already matches the intro pose, same as a settled leave-selection handoff.
   */
  private keepCameraOnDeselect = false;

  constructor(data: DataIndex) {
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
    this.pictures?.destroy();
    this.pictures = null;
  }

  isAnimating(): boolean {
    // A finished morph still needs one frame: settleFinished clears it and paints the end state.
    if (this.transition) return true;
    if (this.returning) return true;
    if (this.dropGhost) return true;
    if (this.hoverFades.isAnimating()) return true;
    if (this.pictures?.hasDeferred()) return true;
    if (this.hoverRevealCity) {
      const elapsed = performance.now() - this.hoverRevealStart;
      const words = 12;
      const total =
        theme.motion.wordStaggerMs * words + theme.motion.wordFadeMs + theme.motion.hoverMs;
      if (elapsed < total) return true;
    }
    return false;
  }

  enter(ctx: SceneContext, from?: SceneId | null): void {
    this.session = null;
    this.dropTarget = null;
    this.shownSelection = null;
    this.shownKey = null;
    this.shownGeom = null;
    this.transition = null;
    this.returning = null;
    this.dropGhost = null;
    this.droppedDrag = null;
    this.pendingDropAnchor = null;
    this.keepCameraOnDeselect = false;
    this.hoverFades.clear();
    this.hoverRevealCity = null;
    // Finish intro (donut step) and "skip intro" both open on Switzerland at the intro pose.
    const fromIntroDonut = from === 'intro' && INTRO_STEPS[ctx.state.introStep]?.figure === 'donut';
    if (fromIntroDonut || from === 'landing') {
      const node = this.nodes.find((n) => n.countryId === INTRO_COUNTRY_ID);
      if (node) {
        const matched = cameraMatchingIntro(
          node,
          { width: ctx.p.width, height: ctx.p.height },
          ctx.viewport,
        );
        const at = worldToScreen(matched, ctx.viewport, node);
        const zoom = overviewZoom(ctx.viewport);
        this.camera = framePoint(node, node.R, at, node.R * zoom, ctx.viewport);
        this.cameraReady = true;
        this.snapZoom();
        // Seed a Switzerland "selection" so the first draw runs leave-selection:
        // morph the intro donut into the overview ring and fade the map in.
        if (fromIntroDonut) {
          const selection: SelectionPart[] = [{ kind: 'country', id: INTRO_COUNTRY_ID }];
          this.shownSelection = selection;
          this.shownKey = encodeSelection(selection);
          this.shownGeom = this.introLeaveGeom(ctx);
          this.keepCameraOnDeselect = true;
        }
        return;
      }
    }
    if (!this.cameraReady) this.resetCamera(ctx);
  }

  /** Switzerland donut in screen space, matching the last intro step. */
  private introLeaveGeom(ctx: SceneContext): DonutGeometry {
    const pose = introDonutScreen(ctx.p.width, ctx.p.height);
    const world = this.worldGeoms.find((g) => g.countryIds[0] === INTRO_COUNTRY_ID);
    if (!world) {
      return donutLayout(
        [{ countryId: INTRO_COUNTRY_ID, cities: citiesOf(ctx.data, INTRO_COUNTRY_ID) }],
        { cx: pose.x, cy: pose.y, R: pose.r },
      );
    }
    return mapDonut(world, pose.x, pose.y, pose.r);
  }

  /** First view: fixed overview zoom, centred on world.initialCountry. */
  resetCamera(ctx: SceneContext): void {
    const node =
      this.nodes.find((n) => n.countryId === theme.world.initialCountry) ?? this.nodes[0];
    this.camera = { x: node?.x ?? 0, y: node?.y ?? 0, zoom: overviewZoom(ctx.viewport) };
    this.cameraReady = true;
    this.snapZoom();
  }

  draw(ctx: SceneContext): void {
    const now = performance.now();
    this.settleFinished(now);
    this.tickHovers(ctx, now);
    const previousSelection = this.shownSelection;
    this.handoffSelection(ctx);
    this.applyViewFocus(ctx);
    if (exploreMode(ctx.state.selection) === 'overview') this.clampOverviewZoom(ctx);
    this.syncTransition(ctx, now, previousSelection);
    this.tickTransitionCamera(now);
    const pictures = this.ensurePictures(ctx.p);
    pictures.beginFrame();

    const leaving = this.transition?.kind === 'leave-selection';
    const entering = this.transition?.kind === 'enter-selection';
    const combiningOnCanvas = Boolean(entering && this.transition?.nextMorph);
    const deselectingSegments = Boolean(leaving && this.transition?.nextMorph);
    const fadeT = this.transition ? this.transition.morph.t(now) : 1;

    if (exploreMode(ctx.state.selection) === 'overview' || leaving || entering) {
      const overviewAlpha = leaving
        ? deselectingSegments
          ? 0
          : fadeT
        : entering
          ? combiningOnCanvas
            ? 1
            : 1 - fadeT
          : 1;
      if (overviewAlpha > 0) {
        this.drawOverview(ctx, now, overviewAlpha);
      }
    }
    if (exploreMode(ctx.state.selection) !== 'overview' || leaving) {
      this.drawSelection(ctx, now);
    }

    if (this.dropGhost) this.drawDropGhost(ctx, now);

    pictures.endFrame();
    if (ctx.state.legendOpen && exploreMode(ctx.state.selection) !== 'overview') {
      this.drawLegendOverlay(ctx);
    } else this.legendPin = null;
  }

  /**
   * Drop tweens that ended before this frame, so the frame after the last tween
   * frame paints the settled view (no leftover brackets or lifted pieces).
   */
  private settleFinished(now: number): void {
    if (this.transition?.morph.done(now)) {
      if (this.transition.nextMorph) {
        const next = this.transition.nextMorph;
        const anchorId = this.transition.anchorId;
        const anchorNode =
          this.transition.kind === 'enter-selection' && anchorId
            ? this.nodes.find((n) => n.countryId === anchorId)
            : undefined;
        let cameraPan: Transition['cameraPan'] | undefined;
        let morphStartMs = now;
        if (anchorNode) {
          const dist = Math.hypot(this.camera.x - anchorNode.x, this.camera.y - anchorNode.y);
          const panDuration = motionMs(theme.motion.panMs);
          if (dist > 1 && panDuration > 0) {
            cameraPan = {
              from: { x: this.camera.x, y: this.camera.y },
              to: { x: anchorNode.x, y: anchorNode.y },
              startMs: now,
              durationMs: panDuration,
            };
            morphStartMs = now + panDuration;
          } else {
            this.camera = { ...this.camera, x: anchorNode.x, y: anchorNode.y };
          }
        }
        this.transition = {
          kind: this.transition.kind,
          morph: new DonutMorph(next.from, next.to, morphStartMs, next.durationMs),
          anchorId,
          cameraPan,
        };
      } else {
        this.shownGeom = this.transition.morph.to;
        this.transition = null;
        this.dropGhost = null;
      }
    }
    if (
      this.returning &&
      progress(this.returning.startMs, now, motionMs(theme.motion.returnMs)) >= 1
    ) {
      this.returning = null;
    }
    if (
      this.dropGhost &&
      progress(
        this.dropGhost.startMs,
        now,
        motionMs(theme.motion.segmentMs) * theme.motion.ghostFadeShare,
      ) >= 1
    ) {
      this.dropGhost = null;
    }
  }

  private tickTransitionCamera(now: number): void {
    const pan = this.transition?.cameraPan;
    if (!pan) return;
    const t = easeInOutCubic(progress(pan.startMs, now, pan.durationMs));
    this.camera = {
      ...this.camera,
      x: lerp(pan.from.x, pan.to.x, t),
      y: lerp(pan.from.y, pan.to.y, t),
    };
  }

  /** Overview has no zoom control. It stays further out than the design-scale close view. */
  private clampOverviewZoom(ctx: SceneContext): void {
    const zoom = overviewZoom(ctx.viewport);
    if (this.camera.zoom === zoom) return;
    this.camera = { ...this.camera, zoom };
    this.snapZoom();
  }

  // ---- drawing ----------------------------------------------------------------------------

  private groupLabel(ctx: SceneContext) {
    return (id: string) => ctx.data.countryById.get(id)?.name ?? id;
  }

  /** Screen type matches the intro copy. World draws divide by the camera zoom. */
  private fontScale(ctx: SceneContext): number {
    return introFrame(ctx.p.width, ctx.p.height).scale;
  }

  private worldTextScale(ctx: SceneContext, zoom: number): number {
    const type = this.fontScale(ctx);
    return zoom > 0 ? type / zoom : type;
  }

  private ensurePictures(p: SceneContext['p']): DonutPictures {
    if (!this.pictures) this.pictures = new DonutPictures(p);
    return this.pictures;
  }

  private snapZoom(): void {
    this.bakedZoom = this.camera.zoom;
  }

  /**
   * One scale for strokes and type: world draws pass 1 and let the camera scale them.
   * A screen-space donut passes the camera zoom so it matches that same size.
   */
  private bodyStyle(
    ctx: SceneContext,
    zoom: number,
    detail: ReturnType<typeof detailLevel>,
    label: string | null,
    lineScale = 1,
    textScale = 1,
  ) {
    return {
      lineScale,
      // Cached pictures and live hover draws must place the gender mark identically.
      genderScale: lineScale,
      zoom,
      detail,
      textScale,
      sectorFilter: ctx.state.sectorFilter,
      label,
      groupLabel: this.groupLabel(ctx),
    };
  }

  /** Soft hover channels for one donut made of `countryIds`. */
  private hoverStyle(ctx: SceneContext, countryIds: readonly string[]) {
    const fades = this.hoverFades;
    const maxOf = (prefix: string) =>
      Math.max(0, ...countryIds.map((id) => fades.get(`${prefix}:${id}`)));
    return {
      hoverMix: (cityId: string) => fades.get(`city:${cityId}`),
      countryMix: maxOf('country'),
      dimMix: maxOf('dim'),
      hoverCityId: ctx.state.hover.cityId,
      hoverCountry: false,
      hoverRevealMs:
        ctx.state.hover.cityId && this.hoverRevealCity === ctx.state.hover.cityId
          ? performance.now() - this.hoverRevealStart
          : 0,
    };
  }

  /** True while any hover channel of this donut is above zero. */
  private hoverActive(g: DonutGeometry): boolean {
    const fades = this.hoverFades;
    if (g.countryIds.some((id) => fades.get(`country:${id}`) > 0 || fades.get(`dim:${id}`) > 0)) {
      return true;
    }
    return g.segments.some((seg) => fades.get(`city:${seg.cityId}`) > 0);
  }

  /** Overview geometry for `g` with an invisible placeholder segment opened for a drop hover. */
  private dropPreviewGeom(ctx: SceneContext, g: DonutGeometry, dropMix: number): DonutGeometry {
    if (dropMix <= 0.001) return g;
    const countryId = g.countryIds[0];
    if (!countryId) return g;
    const activeDrag =
      (this.session?.moved ? this.session.drag : null) ?? this.returning?.drag ?? this.droppedDrag;
    let draggedPeople = 0;
    if (activeDrag?.kind === 'city') {
      draggedPeople = ctx.data.cityById.get(activeDrag.cityId)?.workingPeople ?? 0;
    } else if (activeDrag?.kind === 'country') {
      draggedPeople = ctx.data.countryById.get(activeDrag.countryId)?.workingPeople ?? 0;
    }
    const targetPeople = ctx.data.countryById.get(countryId)?.workingPeople ?? 0;
    const placeholderWeight = draggedPeople > 0 ? draggedPeople : Math.max(1, targetPeople * 0.25);
    const baseCities = citiesOf(ctx.data, countryId);
    const template = baseCities[0];
    if (!template) return g;
    const placeholder = {
      ...template,
      id: `__drop_${countryId}__`,
      name: '',
      workingPeople: placeholderWeight,
    };
    const expanded = donutLayout(
      [
        { countryId, cities: baseCities },
        { countryId, cities: [placeholder], bracket: false },
      ],
      { cx: g.cx, cy: g.cy, R: g.R },
    );
    const morphed = interpolateDonut(g, expanded, easeInOutCubic(dropMix));
    return {
      ...morphed,
      segments: morphed.segments.filter((seg) => seg.cityId !== placeholder.id),
      groups: g.groups,
    };
  }

  private tickHovers(ctx: SceneContext, now: number): void {
    const active = new Map<string, number>();
    const { cityId, countryId } = ctx.state.hover;
    if (cityId) active.set(`city:${cityId}`, 1);
    // A city hover dims the rest of its donut. Kept separate from the city mix so moving
    // between two cities does not briefly undim the others.
    if (cityId && countryId) active.set(`dim:${countryId}`, 1);
    if (countryId && cityId === null) active.set(`country:${countryId}`, 1);
    if (this.dropTarget) active.set(`drop:${this.dropTarget}`, 1);
    this.hoverFades.setActive(active);
    this.hoverFades.tick(now, motionMs(theme.motion.hoverMs));

    const city = exploreMode(ctx.state.selection) === 'overview' ? null : ctx.state.hover.cityId;
    if (city !== this.hoverRevealCity) {
      this.hoverRevealCity = city;
      this.hoverRevealStart = now;
    }
  }

  /**
   * Settled donut blit from the offscreen picture cache.
   * Falls back to a live ring draw on the single frame before its buffer builds.
   */
  private paintCached(
    ctx: SceneContext,
    g: DonutGeometry,
    id: string,
    zoom: number,
    bakedZoom: number,
    label: string | null,
    lineScale = 1,
    textScale = 1,
    alpha = 1,
  ): void {
    const detail = detailLevel(g.R * zoom, designZoom(ctx.viewport));
    const pic = this.ensurePictures(ctx.p).pictureFor({
      id,
      geom: g,
      zoom,
      bakedZoom,
      lineScale,
      genderScale: lineScale,
      textScale,
      sectorFilter: ctx.state.sectorFilter,
      detail: detailLevel(g.R * bakedZoom, designZoom(ctx.viewport)),
      label,
      groupLabel: this.groupLabel(ctx),
    });
    if (pic) {
      blitDonut(ctx.p, pic, g, alpha);
      return;
    }
    // No buffer yet: draw the complete donut live so labels never pop in a frame later.
    drawDonut(ctx.p, g, {
      ...this.bodyStyle(ctx, zoom, detail, label, lineScale, textScale),
      genderScale: lineScale,
      details: true,
      alpha,
    });
  }

  /**
   * Focus and compare draw one donut in the viewport. Closing the selection
   * opens the map on that donut. The centre stays; the zoom stays at the fixed overview level.
   */
  private handoffSelection(ctx: SceneContext): void {
    const next = ctx.state.selection;
    const previous = this.shownSelection;
    this.shownSelection = next;
    if (!previous || previous.length === 0 || next.length > 0) return;
    this.droppedDrag = null;
    if (this.keepCameraOnDeselect) {
      this.keepCameraOnDeselect = false;
      return;
    }
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

  private syncTransition(
    ctx: SceneContext,
    now: number,
    previousSelection: readonly SelectionPart[] | null,
  ): void {
    const next = ctx.state.selection;
    const key = encodeSelection(next);
    if (key === this.shownKey && this.transition === null) {
      if (exploreMode(next) !== 'overview') {
        this.shownGeom = this.selectionGeometry(ctx);
      }
      return;
    }
    if (key === this.shownKey) return;

    const previous = this.shownKey;
    const prevSelection = previousSelection ?? [];
    const wasOverview = previous === null || previous === '';
    const isOverview = next.length === 0;

    const to = isOverview ? this.anchorScreenGeom(ctx, prevSelection) : this.selectionGeometry(ctx);

    let from: DonutGeometry;
    let kind: TransitionKind;
    let anchorId: string | null = null;
    let cameraPan: Transition['cameraPan'] | undefined;
    let nextMorph: DonutMorph | undefined;
    let morphStartMs = now;

    if (this.shownGeom && this.transition && !this.transition.morph.done(now)) {
      from = this.placeTransitionDonut(ctx, this.transition.morph.current(now));
    } else if (this.shownGeom) {
      from = this.shownGeom;
    } else {
      from = to;
    }

    if (wasOverview && !isOverview) {
      kind = 'enter-selection';
      const dropAnchor = this.pendingDropAnchor;
      this.pendingDropAnchor = null;
      anchorId =
        dropAnchor ??
        selectionTargetCountry(next, (id) => ctx.data.cityById.get(id)?.country) ??
        null;
      const anchorNode = anchorId ? this.nodes.find((n) => n.countryId === anchorId) : undefined;
      const centredCamera = anchorNode
        ? { ...this.camera, x: anchorNode.x, y: anchorNode.y }
        : this.camera;
      const screen = this.countryScreenGeomAt(ctx, anchorId, centredCamera);
      from =
        dropAnchor && screen
          ? this.dropPreviewGeom(ctx, screen, this.hoverFades.get(`drop:${dropAnchor}`))
          : (screen ?? from);

      if (dropAnchor && screen && !this.sameSegmentLayout(screen, to)) {
        const combinedOnCanvas = mapDonut(to, screen.cx, screen.cy, screen.R);
        nextMorph = new DonutMorph(combinedOnCanvas, to, now);
      } else if (anchorNode) {
        const dist = Math.hypot(this.camera.x - anchorNode.x, this.camera.y - anchorNode.y);
        const panDuration = motionMs(theme.motion.panMs);
        if (dist > 1 && panDuration > 0) {
          cameraPan = {
            from: { x: this.camera.x, y: this.camera.y },
            to: { x: anchorNode.x, y: anchorNode.y },
            startMs: now,
            durationMs: panDuration,
          };
          morphStartMs = now + panDuration;
        } else {
          this.camera = centredCamera;
        }
      }
    } else if (!wasOverview && isOverview) {
      kind = 'leave-selection';
      anchorId =
        selectionTargetCountry(prevSelection, (id) => ctx.data.cityById.get(id)?.country) ?? null;
      from = this.shownGeom ?? this.selectionGeometryFrom(ctx, prevSelection);
      if (anchorId && !this.sameSegmentLayout(from, to)) {
        const settledSelection = this.selectionGeometryFrom(ctx, [
          { kind: 'country', id: anchorId },
        ]);
        const settledAtFromSize = mapDonut(settledSelection, from.cx, from.cy, from.R);
        nextMorph = new DonutMorph(settledAtFromSize, to, now);
      }
    } else {
      kind = 'selection';
      if (this.pendingDropAnchor) {
        const screen = this.countryScreenGeom(ctx, this.pendingDropAnchor);
        if (screen) from = screen;
        anchorId = this.pendingDropAnchor;
        this.pendingDropAnchor = null;
      }
    }

    this.shownKey = key;
    if (previous === null && wasOverview && isOverview) {
      this.shownGeom = null;
      return;
    }
    if (motionMs(theme.motion.segmentMs) === 0) {
      this.shownGeom = to;
      this.transition = null;
      return;
    }
    const firstTarget = nextMorph ? nextMorph.from : to;
    this.transition = {
      kind,
      morph: new DonutMorph(from, firstTarget, morphStartMs),
      anchorId,
      cameraPan,
      nextMorph,
    };
  }

  private sameSegmentLayout(a: DonutGeometry, b: DonutGeometry): boolean {
    if (a.segments.length !== b.segments.length) return false;
    const hasBracketA = a.groups.some((g) => g.bracket !== false);
    const hasBracketB = b.groups.some((g) => g.bracket !== false);
    if (hasBracketA !== hasBracketB) return false;
    return a.segments.every((seg, i) => {
      const other = b.segments[i];
      if (!other || seg.cityId !== other.cityId) return false;
      return Math.abs(seg.a0 - other.a0) < 1e-4 && Math.abs(seg.a1 - other.a1) < 1e-4;
    });
  }

  private selectionGeometryFrom(
    ctx: SceneContext,
    selection: readonly SelectionPart[],
  ): DonutGeometry {
    const center = rectCenter(ctx.viewport);
    const countries = new Set(
      selection.filter((part) => part.kind === 'country').map((part) => part.id),
    );
    const groups = selection.flatMap((part) => this.partGroup(ctx, part, countries));
    const hasBrackets = selectionHasBrackets(selection, (id) => ctx.data.cityById.get(id)?.country);
    const minSide = Math.min(ctx.viewport.w, ctx.viewport.h);
    return donutLayout(groups, {
      cx: center.x,
      cy: center.y,
      R: selectionRadius(minSide, hasBrackets),
    });
  }

  private anchorScreenGeom(ctx: SceneContext, selection: readonly SelectionPart[]): DonutGeometry {
    const id =
      selectionTargetCountry(selection, (cityId) => ctx.data.cityById.get(cityId)?.country) ?? null;
    return this.countryScreenGeom(ctx, id) ?? this.selectionGeometry(ctx);
  }

  private countryScreenGeom(ctx: SceneContext, countryId: string | null): DonutGeometry | null {
    return this.countryScreenGeomAt(ctx, countryId, this.camera);
  }

  private countryScreenGeomAt(
    ctx: SceneContext,
    countryId: string | null,
    camera: Camera,
  ): DonutGeometry | null {
    if (!countryId) return null;
    const world = this.worldGeoms.find((g) => g.countryIds[0] === countryId);
    const node = this.nodes.find((n) => n.countryId === countryId);
    if (!world || !node) return null;
    const screen = worldToScreen(camera, ctx.viewport, node);
    return mapDonut(world, screen.x, screen.y, node.R * camera.zoom);
  }

  private drawOverview(ctx: SceneContext, now: number, alpha: number): void {
    const { p, state, data } = ctx;
    const zoom = this.camera.zoom;
    const textScale = this.worldTextScale(ctx, zoom);
    const drag = this.session?.moved ? this.session.drag : null;
    const ret = this.returning;
    const omitCity =
      drag?.kind === 'city'
        ? drag.cityId
        : ret?.drag.kind === 'city'
          ? ret.drag.cityId
          : this.dropGhost?.drag.kind === 'city'
            ? this.dropGhost.drag.cityId
            : this.droppedDrag?.kind === 'city'
              ? this.droppedDrag.cityId
              : null;
    const omitCountry =
      drag?.kind === 'country'
        ? drag.countryId
        : ret?.drag.kind === 'country'
          ? ret.drag.countryId
          : this.dropGhost?.drag.kind === 'country'
            ? this.dropGhost.drag.countryId
            : this.droppedDrag?.kind === 'country'
              ? this.droppedDrag.countryId
              : null;
    const omitCityCountry =
      drag?.countryId ??
      ret?.drag.countryId ??
      this.dropGhost?.drag.countryId ??
      this.droppedDrag?.countryId;
    const pictures = this.ensurePictures(p);
    const labelPad = theme.canvas.labelPad;
    const anchorId = this.transition?.anchorId;
    const frameScale = designZoom(ctx.viewport);

    p.push();
    applyCamera(p, this.camera, ctx.viewport);

    for (const g of this.worldGeoms) {
      const countryId = g.countryIds[0] ?? '';
      if (anchorId && countryId === anchorId && this.transition) continue;
      const id = `world:${countryId}`;
      const label = data.countryById.get(countryId)?.name ?? countryId;
      const detail = detailLevel(g.R * zoom, frameScale);
      if (omitCountry === countryId) {
        pictures.retain(id);
        continue;
      }
      const dropMix = this.hoverFades.get(`drop:${countryId}`);
      if (omitCity && countryId === omitCityCountry) {
        pictures.retain(id);
        drawDonut(p, g, {
          ...this.bodyStyle(ctx, zoom, detail, label, 1, textScale),
          ...this.hoverStyle(ctx, g.countryIds),
          omitCityId: omitCity,
          alpha,
        });
      } else if (!circleHitsViewport(this.camera, ctx.viewport, g.cx, g.cy, g.outer, labelPad)) {
        continue;
      } else if (
        this.dropTarget === countryId ||
        dropMix > 0.001 ||
        this.hoverActive(g) ||
        state.hover.countryId === countryId
      ) {
        pictures.retain(id);
        const drawnGeom = dropMix > 0.001 ? this.dropPreviewGeom(ctx, g, dropMix) : g;
        drawDonut(p, drawnGeom, {
          ...this.bodyStyle(ctx, zoom, detail, label, 1, textScale),
          ...this.hoverStyle(ctx, g.countryIds),
          alpha,
        });
      } else {
        this.paintCached(ctx, g, id, zoom, this.bakedZoom, label, 1, textScale, alpha);
      }
    }

    if (drag?.kind === 'country') this.drawLiftedCountry(ctx, drag, null, now);
    if (drag?.kind === 'city') this.drawLiftedCity(ctx, drag, null, now);
    if (ret?.drag.kind === 'country') this.drawLiftedCountry(ctx, ret.drag, ret, now);
    if (ret?.drag.kind === 'city') this.drawLiftedCity(ctx, ret.drag, ret, now);
    p.pop();
  }

  /** Whole country donut following the pointer, or easing home. */
  private drawLiftedCountry(
    ctx: SceneContext,
    drag: DragCountry,
    ret: DragReturn | null,
    now: number,
  ): void {
    const geom = this.worldGeoms.find((g) => g.countryIds[0] === drag.countryId);
    if (!geom) return;
    const zoom = this.camera.zoom;
    const { p } = ctx;
    const { offset, alpha } = this.liftPose(ctx, drag, ret, now, {
      x: geom.cx,
      y: geom.cy,
    });
    p.push();
    p.translate(offset.x, offset.y);
    drawDonut(p, geom, {
      ...this.bodyStyle(
        ctx,
        zoom,
        detailLevel(geom.R * zoom, designZoom(ctx.viewport)),
        ctx.data.countryById.get(drag.countryId)?.name ?? null,
        1,
        this.worldTextScale(ctx, zoom),
      ),
      alpha,
    });
    p.pop();
  }

  /** City segment following the pointer, or easing home. */
  private drawLiftedCity(
    ctx: SceneContext,
    drag: DragCity,
    ret: DragReturn | null,
    now: number,
  ): void {
    const geom = this.worldGeoms.find((g) => g.countryIds[0] === drag.countryId);
    const seg = geom?.segments.find((s) => s.cityId === drag.cityId);
    const center = geom ? citySegmentCenter(geom, drag.cityId) : null;
    if (!geom || !seg || !center) return;

    const zoom = this.camera.zoom;
    const { p } = ctx;
    const { offset, alpha } = this.liftPose(ctx, drag, ret, now, center);
    p.push();
    p.translate(offset.x, offset.y);
    ctx2d(p).globalAlpha = alpha;
    drawSegment(p, geom, seg, {
      lineScale: 1,
      textScale: this.worldTextScale(ctx, zoom),
      zoom,
      detail: detailLevel(geom.R * zoom, designZoom(ctx.viewport)),
      hoverCityId: null,
      hoverCountry: false,
      sectorFilter: ctx.state.sectorFilter,
      details: true,
    });
    ctx2d(p).globalAlpha = 1;
    p.pop();
  }

  private liftPose(
    ctx: SceneContext,
    drag: Drag,
    ret: DragReturn | null,
    now: number,
    home: Point,
  ): { offset: Point; alpha: number } {
    if (ret) {
      const t = easeOutCubic(progress(ret.startMs, now, motionMs(theme.motion.returnMs)));
      return {
        offset: {
          x: lerp(ret.fromOffset.x, 0, t),
          y: lerp(ret.fromOffset.y, 0, t),
        },
        alpha: 1,
      };
    }
    if (!this.pointer) return { offset: { x: 0, y: 0 }, alpha: 1 };
    const at = screenToWorld(this.camera, ctx.viewport, this.pointer);
    return {
      offset: {
        x: at.x - drag.grab.x - home.x,
        y: at.y - drag.grab.y - home.y,
      },
      alpha: 1,
    };
  }

  private drawDropGhost(ctx: SceneContext, now: number): void {
    const ghost = this.dropGhost;
    if (!ghost) return;
    const share = theme.motion.ghostFadeShare;
    const t = progress(ghost.startMs, now, motionMs(theme.motion.segmentMs) * share);
    if (t >= 1) return;
    const alpha = 0.8 * (1 - t);
    const { p } = ctx;
    const zoom = this.camera.zoom;
    p.push();
    applyCamera(p, this.camera, ctx.viewport);
    if (ghost.drag.kind === 'country') {
      const geom = this.worldGeoms.find((g) => g.countryIds[0] === ghost.drag.countryId);
      if (geom) {
        p.push();
        p.translate(ghost.offset.x, ghost.offset.y);
        drawDonut(p, geom, {
          ...this.bodyStyle(
            ctx,
            zoom,
            detailLevel(geom.R * zoom, designZoom(ctx.viewport)),
            ctx.data.countryById.get(ghost.drag.countryId)?.name ?? null,
            1,
            this.worldTextScale(ctx, zoom),
          ),
          alpha,
        });
        p.pop();
      }
    } else {
      const drag = ghost.drag;
      const geom = this.worldGeoms.find((g) => g.countryIds[0] === drag.countryId);
      const seg = geom?.segments.find((s) => s.cityId === drag.cityId);
      if (geom && seg) {
        p.push();
        p.translate(ghost.offset.x, ghost.offset.y);
        ctx2d(p).globalAlpha = alpha;
        drawSegment(p, geom, seg, {
          lineScale: 1,
          textScale: this.worldTextScale(ctx, zoom),
          zoom,
          detail: detailLevel(geom.R * zoom, designZoom(ctx.viewport)),
          hoverCityId: null,
          hoverCountry: false,
          sectorFilter: ctx.state.sectorFilter,
          details: true,
        });
        ctx2d(p).globalAlpha = 1;
        p.pop();
      }
    }
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
    if (this.transition?.kind === 'leave-selection' && this.transition.anchorId) {
      if (this.transition.nextMorph) return null;
      return ctx.data.countryById.get(this.transition.anchorId)?.name ?? null;
    }
    const [only] = ctx.state.selection;
    if (ctx.state.selection.length !== 1 || !only) return null;
    if (only.kind === 'country') return ctx.data.countryById.get(only.id)?.name ?? null;
    return ctx.data.cityById.get(only.id)?.name ?? null;
  }

  private selectionGeometry(ctx: SceneContext): DonutGeometry {
    return this.selectionGeometryFrom(ctx, ctx.state.selection);
  }

  private placeTransitionDonut(ctx: SceneContext, g: DonutGeometry): DonutGeometry {
    if (this.transition?.kind !== 'enter-selection' || !this.transition.anchorId) return g;
    const node = this.nodes.find((n) => n.countryId === this.transition?.anchorId);
    if (!node) return g;
    const screen = worldToScreen(this.camera, ctx.viewport, node);
    return mapDonut(g, screen.x, screen.y, g.R);
  }

  private drawSelection(ctx: SceneContext, now: number): void {
    const { p } = ctx;
    const morphing = this.transition && !this.transition.morph.done(now);
    const rawG = morphing ? this.transition!.morph.current(now) : this.selectionGeometry(ctx);
    const g = morphing ? this.placeTransitionDonut(ctx, rawG) : rawG;
    if (!morphing) this.shownGeom = g;
    const label = this.selectionLabel(ctx);
    const scale = overviewZoom(ctx.viewport);
    const type = this.fontScale(ctx);
    const hover = this.hoverStyle(ctx, g.countryIds);
    const showBrackets =
      this.transition?.kind !== 'enter-selection' && this.transition?.kind !== 'leave-selection';

    // Leaving selection draws the morph in screen space over the fading overview.
    if (this.transition?.kind === 'leave-selection') {
      p.push();
      p.resetMatrix();
      drawDonut(p, g, {
        ...this.bodyStyle(ctx, 1, detailLevel(g.R), label, scale, type),
        ...hover,
        hoverInfo: true,
        brackets: showBrackets,
      });
      p.pop();
      return;
    }

    // Selection view only ever shows a single donut, so draw it crisp and live.
    drawDonut(p, g, {
      ...this.bodyStyle(ctx, 1, detailLevel(g.R), label, scale, type),
      ...hover,
      hoverInfo: true,
      brackets: showBrackets,
    });
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
        // Strokes follow the map. Type uses the intro frame scale.
        overviewZoom(ctx.viewport),
        this.fontScale(ctx),
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
    this.returning = null;
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
      return this.hoverFades.isAnimating();
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
        const target = this.dropTarget;
        this.dropGhost = null;
        this.droppedDrag = s.drag;
        this.pendingDropAnchor = target;
        if (s.drag.kind === 'city') {
          ctx.actions.selectCountryWithCity(target, s.drag.cityId);
        } else {
          ctx.actions.selectCountries([target, s.drag.countryId]);
        }
      } else {
        this.returning = {
          drag: s.drag,
          fromOffset: this.currentLiftOffset(ctx, s.drag),
          startMs: performance.now(),
        };
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

  private currentLiftOffset(ctx: SceneContext, drag: Drag): Point {
    if (!this.pointer) return { x: 0, y: 0 };
    const geom = this.worldGeoms.find((g) => g.countryIds[0] === drag.countryId);
    if (!geom) return { x: 0, y: 0 };
    const home =
      drag.kind === 'city' ? citySegmentCenter(geom, drag.cityId) : { x: geom.cx, y: geom.cy };
    if (!home) return { x: 0, y: 0 };
    const at = screenToWorld(this.camera, ctx.viewport, this.pointer);
    return { x: at.x - drag.grab.x - home.x, y: at.y - drag.grab.y - home.y };
  }

  /**
   * Trackpad two-finger scroll and the mouse wheel pan the overview.
   * Pinch-zoom (ctrlKey) is ignored: the overview zoom stays fixed.
   */
  wheel(ctx: SceneContext, e: WheelInput): boolean {
    if (e.ctrlKey) return false;
    if (this.session) return false;
    if (exploreMode(ctx.state.selection) !== 'overview') return false;
    const { x, y } = wheelPan(e, ctx.viewport);
    if (x === 0 && y === 0) return false;
    this.camera = panBy(this.camera, x, y);
    return true;
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
    if (ghost && this.session?.drag) {
      this.returning = {
        drag: this.session.drag,
        fromOffset: this.currentLiftOffset(ctx, this.session.drag),
        startMs: performance.now(),
      };
      this.session = null;
      this.dropTarget = null;
    }
    this.pointer = null;
    ctx.actions.setHover({ countryId: null, cityId: null });
    return ghost || this.hoverFades.isAnimating();
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
    const moves: Record<string, () => Camera> = {
      ArrowLeft: () => panBy(this.camera, KEY_PAN, 0),
      ArrowRight: () => panBy(this.camera, -KEY_PAN, 0),
      ArrowUp: () => panBy(this.camera, 0, KEY_PAN),
      ArrowDown: () => panBy(this.camera, 0, -KEY_PAN),
    };
    if (key === 'Home') {
      this.resetCamera(ctx);
      return true;
    }
    const move = moves[key];
    if (!move) return ctx.state.legendOpen;
    this.camera = move();
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
      animating: this.isAnimating(),
      transition: this.transition?.kind ?? null,
    };
  }
}
