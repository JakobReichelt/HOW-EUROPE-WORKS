/**
 * Visual tokens for the canvas. Keep in sync with src/styles/tokens.css.
 * Measured from Figma (design frame 1536 x 960): 230:10924 (donut anatomy), 347:6230 (overview),
 * 360:6643 (legend), 360:2397 (combined), 393:16582 (hover).
 */
import type { SectorKey } from '../data/types';

const sector: Record<SectorKey, string> = {
  public: '#cce3de',
  trade: '#4da1a9',
  business: '#ffa630',
  industry: '#e8e6bd',
};

export const theme = {
  color: {
    ink: '#000000',
    paper: '#ffffff',
    shadow: '#dadedc',
    shadowHover: '#b9bfbc',
    muted: '#a9a9a9',
    mutedDark: '#808080',
    field: '#eeeeee',
    commute: '#ff0000',
    sector,
  },
  font: {
    family: 'Baikal VAR',
    /** Baikal has no gender symbols; keep labels in Baikal and draw symbols in this face. */
    symbolFamily: 'Segoe UI Symbol, Apple Symbols, Noto Sans Symbols2, sans-serif',
    xs: 14,
    s: 18,
  },
  stroke: {
    thin: 1,
    hover: 1.5,
  },
  layout: {
    stripWidth: 24,
    panelWidth: 127,
    /** Figma artboard; world units on the explore canvas are design pixels. */
    design: { width: 1536, height: 960 },
  },
  /**
   * Donut proportions as fractions of the donut radius R (R = 400 for the largest Figma donut).
   * Guides in Figma: 30 min at 0.577 R, 40 at 0.667 R, 50 at 0.757 R -> 0.009 R per minute.
   */
  donut: {
    /** Inner edge of a segment with the shortest commute (COMMUTE.domain[0] = 20 min). */
    baseline: 0.487,
    /** Extra radius across COMMUTE.domain (35 min x 0.009). */
    commuteSpan: 0.315,
    /** Radial thickness of a city segment. */
    band: 0.175,
    /** Thickness of one unemployment step of the grey band. */
    shadowStep: 0.027,
    /** Angular gap between segments in radians. */
    gap: 0.022,
    /** Thin opening just before 12 o'clock on a single-city ring. The segment starts on the vertical. */
    singleGap: 0.08,
    /** Below this outer arc length (px) a segment gets no city / gender labels. */
    minLabelArc: 40,
    /**
     * How far the other segments move toward white while one city is hovered.
     * The fills stay opaque, so the commute rings underneath stay covered.
     */
    dimAlpha: 0.4,
    /** Combined donut: radius of the bracket ring, gap at country boundaries, tick length (px). */
    groupRing: 1.1,
    groupGap: 0.012,
    groupTick: 8,
  },
  /** Pixel sizes of donut details (world units in the overview, screen px elsewhere). */
  detail: {
    hatchSpacing: 12,
    /** Hatch direction in radians (Figma line pattern ~45 deg). */
    hatchAngle: Math.PI / 4,
    genderTick: 14,
    /** Figma 347:6710 / 381:7173 white pill behind the percent. */
    genderPill: { height: 22, padX: 4, radius: 10 },
    /** Figma Group 11 / 12 icon size in px. */
    genderSymbolSize: 10,
    /** Diameter of one dot in the single-city ellipsis, px. */
    ellipsisDot: 3,
    labelOffset: 6,
    /** Space between the working-people line and the commuter-rate line under it. */
    hoverGap: 6,
  },
  world: {
    /**
     * Smallest / largest country donut radius (Figma small = 256).
     * Working people map linearly onto circle AREA between these radii; the
     * drawn radius is sqrt(area). maxRadius is above the Figma large (400) so
     * area differences stay readable.
     */
    minRadius: 256,
    maxRadius: 800,
    /**
     * Gap between neighbouring donuts, in world px.
     * Clears a city name on one ring and the two-line hover on the other:
     * label offset, a font line, the hover gap, and another font line, plus a little air.
     */
    padding: 72,
    /**
     * World units per degree of latitude for the geographic seed.
     * Longitude is scaled by cos(48 deg) so east-west degrees match north-south ones.
     * Tuned so the drawn rings meet and neighbours stay in map order.
     */
    geoScale: 200,
    /** Country centred on first view (Figma 347:6230). */
    initialCountry: 'FR',
  },
  /** Selection donut radius as a fraction of the smaller viewport side. One size for every selection. */
  focus: { radius: 0.42 },
  zoom: {
    /** Absolute floor used by framing helpers; overview min is the fit-all zoom instead. */
    min: 0.15,
    max: 2,
    wheelStep: 1.1,
    /** Screen px inset when fitting every country donut in the viewport. */
    fitPadding: 48,
  },
  /**
   * Redraw cost. Pictures are offscreen snapshots of static donuts; detail drops
   * hatch and arc labels when a donut is too small on screen to read.
   */
  canvas: {
    /** Main canvas backing store never exceeds this, even on a denser display. */
    maxPixelRatio: 1.5,
    /** Screen px of donut radius R at or above which hatch and arc labels are drawn. */
    fullRadius: 160,
    /** Vertex step of a segment outline, in radians. */
    arcStep: 0.04,
    /** Coarser step used when the donut is too small to read. */
    arcStepCoarse: 0.15,
    /** World units added around a donut when culling, so labels are not cut off. */
    labelPad: 48,
    /** Offscreen picture side above which the donut is drawn live instead. */
    pictureMaxSide: 1024,
    /** Wait after the last wheel event before rebaking pictures at the new zoom. */
    zoomSettleMs: 150,
  },
  /**
   * Legend callouts (Figma 360:6643). Screen pixels at sizeScale 1 (selection-sized
   * donut). Overview passes screenR / focusR so callouts track camera zoom.
   */
  legend: {
    /** White veil over everything except the annotated segment. */
    veilAlpha: 0.94,
    /** Labels that are not this city's own value. */
    inactive: '#949494',
    /** Shortest legend line (innermost ring) at sizeScale 1, in px along the arc. */
    snippet: 24,
    /** Extra arc length per ring outward at sizeScale 1, in px. */
    lengthStep: 36,
    /** Preferred longest line, in radians, for the base staircase. */
    maxArc: 0.55,
    /** Hard cap while growing a line to clear an overlapping label. */
    resolveArc: 1.25,
    /** Clearance between legend label boxes, in px at sizeScale 1. */
    labelGap: 6,
    /**
     * Gap from the arc tip to the near edge of the label (px at sizeScale 1).
     * Layout also adds half the font height so a middle baseline cannot sit on
     * the stroke when the callout tangent is nearly vertical.
     */
    labelPad: 10,
    /** How far each collision pass lengthens a line, in px at sizeScale 1. */
    growStep: 6,
    /**
     * A city wider than this (radians) fills the ring, so it is a poor default
     * example when a smaller complete segment exists.
     */
    maxExampleSpan: 1.6,
  },
  /**
   * Landing page on the 1536 x 960 frame (Figma 393:13621).
   * Copy and fragment centres are design pixels from the top-left.
   * rotation = start value; rotateTo / durationMs / easing describe the later
   * boomerang animation and are unused for now.
   */
  landing: {
    opacity: 0.35,
    durationMs: 20016,
    easing: [0.5, 0, 0.5, 1] as const,
    title: { x: 523, y: 291, w: 239 },
    subtitle: { x: 776, y: 368 },
    start: { x: 523, y: 432 },
    skip: { x: 776, y: 432 },
    fragments: [
      { countryId: 'FR', x: 328, y: 901, R: 810, rotation: 0.524, rotateTo: -1.745 },
      { countryId: 'DE', x: 1550, y: 506, R: 340, rotation: -1.439, rotateTo: 4.844 },
    ],
  },
  /**
   * Intro story on the 1536 x 960 frame (Figma 415:1295 ... 419:2812).
   * Coordinates are design pixels from the top-left of that frame.
   */
  intro: {
    box: { x: 523, y: 384, w: 364, h: 64 },
    /** 32px between the 30 / 40 / 50 min lines. */
    pxPerMinute: 3.2,
    /**
     * Commute step only: lift the bar + copy by one guide step so the new
     * "no data" mark (COMMUTE.domain[0]) lands where the old 30 min line sat.
     */
    commuteLift: 32,
    shadowStep: 8,
    /** Unemployment scale lines, distance above the box top. */
    levelOffset: { high: 56, medium: 32, low: 8 },
    /** Callout lines end this far past the box. The label starts 10px after that. */
    calloutPast: 37,
    calloutGap: 10,
    /** Short callouts begin this far left of the box's right edge. */
    calloutInset: 48,
    /** The explained commute line begins this far right of the box's left edge. */
    longGuideInset: 44,
    /**
     * Vertical red connectors between commute scale marks (commute step only).
     * x is measured from the box's right edge; head/gap are design pixels.
     */
    scaleArrow: { x: 18, head: 3.5, gap: 5 },
    bracket: { peopleGap: 24, commuterGap: 16, tick: 16, labelGap: 18 },
    /**
     * Figma 417:2603. The stem drops from the divider. The mars glyph sits to its
     * left, and the label is left-aligned with that glyph.
     */
    gender: { symbolSize: 11, symbolLeft: 17, symbolTop: 6, tick: 16, labelTop: 22 },
    /**
     * Switzerland donut (Figma 419:2812). cx is nudged right of the group bbox
     * centre so the ring looks centred between intro back / explore.
     */
    donut: { cx: 742, cy: 444, R: 200 },
    nav: {
      back: { x: 523, y: 591 },
      next: { x: 858, y: 591 },
      explore: { x: 784, y: 688 },
    },
    copy: {
      opening: { x: 523, y: 272, w: 254 },
      above: { x: 523, y: 355, w: 270 },
      lead: { x: 523, y: 339, w: 270 },
      /** lead.y - commuteLift; keeps the gap above the lifted commute bar. */
      commute: { x: 523, y: 307, w: 270 },
      /** 347 - commuteLift; same lift as the commute step. */
      summary: { x: 523, y: 315, w: 270 },
      donut: { x: 627, y: 160, w: 270 },
    },
  },
} as const;
