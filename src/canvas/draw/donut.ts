/**
 * Draws a donut from DonutGeometry (Figma 230:10924, 360:2397, 393:16582).
 * Layer order: red commute guides (behind), then per city segment: unemployment band, segment,
 * hatched commuters, gender divider, labels. Static: later animation should interpolate the
 * geometry, not change this API.
 */
import type p5 from 'p5';
import { theme } from '../../config/theme';
import { formatInt, formatPercent } from '../../data/format';
import type { SectorFilter } from '../../state/types';
import { labelFitsSegment, type DonutGeometry, type Segment } from '../layout/donutLayout';
import type { DetailLevel } from '../view/visibility';
import { polar, type Point } from '../geometry';
import {
  annularSector,
  arcText,
  ctx2d,
  hatchLines,
  radialLine,
  ringOutline,
  setDash,
  drawMarsSymbol,
  drawVenusSymbol,
  roundRectFill,
  withSectorClip,
  type TextRun,
} from './shapes';

const c = theme.color;
const d = theme.donut;
const px = theme.detail;

export interface DonutStyle {
  /** 1 / zoom on the map, so strokes, hatch, ticks and label gaps stay screen-sized. */
  lineScale: number;
  /**
   * Multiplier on theme font sizes, in the donut's own coordinates.
   * Overview passes donutR / focusR so camera zoom yields selection-sized type
   * when the ring is the selection size. Legend (screen-space geom) passes the
   * same ratio for the on-screen radius: screenR / focusR.
   */
  textScale: number;
  /**
   * Centre country label only. When omitted, uses `textScale`. Overview raises
   * this when zoomed out so names stay readable while city labels keep `textScale`.
   */
  labelScale?: number;
  /** Scale already applied by the camera or a picture buffer. */
  zoom: number;
  /** `mark` skips hatch and arc labels when the donut is small on screen. */
  detail: DetailLevel;
  /** Hovered city: darker band, info along the arc or in the centre. Other segments lighten. */
  hoverCityId: string | null;
  /** Whole donut is hovered: darker band on every segment. */
  hoverCountry: boolean;
  sectorFilter: SectorFilter;
  /** Text in the centre (country name), null for none. */
  label: string | null;
  /** Bracket label per country in combined donuts. */
  groupLabel: (countryId: string) => string;
  /** City names along the segments and gender labels. */
  details: boolean;
  /** Overall opacity. */
  alpha: number;
  /** City left out of this draw, because it is being dragged elsewhere. */
  omitCityId: string | null;
}

export const defaultDonutStyle: DonutStyle = {
  lineScale: 1,
  textScale: 1,
  zoom: 1,
  detail: 'full',
  hoverCityId: null,
  hoverCountry: false,
  sectorFilter: null,
  label: null,
  groupLabel: (countryId) => countryId,
  details: true,
  alpha: 1,
  omitCityId: null,
};

function centerLabelScale(s: DonutStyle): number {
  return s.labelScale ?? s.textScale;
}

export function drawDonut(p: p5, g: DonutGeometry, style: Partial<DonutStyle> = {}): void {
  const s = { ...defaultDonutStyle, ...style };
  const ctx = ctx2d(p);
  p.push();
  p.textFont(theme.font.family);
  ctx.globalAlpha = s.alpha;
  drawGuides(p, g, s.lineScale);
  const hovered = g.segments.find(
    (seg) => seg.cityId === s.hoverCityId && seg.cityId !== s.omitCityId,
  );
  const hover = hovered ? layoutHover(p, hovered, s.textScale, s.lineScale) : null;
  const segmentStyle = { ...s, hoverLabelOnSegment: hover?.place === 'center' };
  for (const seg of g.segments) {
    if (seg.cityId === s.omitCityId) continue;
    ctx.globalAlpha = s.alpha;
    drawSegment(p, g, seg, segmentStyle);
  }
  ctx.globalAlpha = s.alpha;
  drawEllipsis(p, g, s.lineScale);
  if (g.groups.length > 1) drawGroupBrackets(p, g, s);
  if (s.label && hover?.place !== 'center') {
    drawCenterLabel(p, g, s.label, centerLabelScale(s), s.lineScale);
  }
  if (hover) drawHoverInfo(p, g, hover, s.textScale);
  p.pop();
}

/**
 * City names, gender percents and the centre label. Draw under the same transform
 * as the donut. Centre labels stay on at every detail level so overview names
 * remain visible when the ring is too small for city type.
 */
export function drawDonutText(p: p5, g: DonutGeometry, style: Partial<DonutStyle> = {}): void {
  const s = { ...defaultDonutStyle, ...style };
  p.push();
  p.textFont(theme.font.family);
  if (s.label) drawCenterLabel(p, g, s.label, centerLabelScale(s), s.lineScale);
  if (s.detail !== 'full') {
    p.pop();
    return;
  }
  const size = theme.font.xs * s.textScale;
  for (const seg of g.segments) {
    if (seg.cityId === s.omitCityId) continue;
    const room = (seg.a1 - seg.a0) * seg.r1 * s.zoom >= d.minLabelArc;
    if (!room) continue;
    p.noStroke();
    p.fill(theme.color.ink);
    p.textSize(size);
    arcText(p, seg.city.name, {
      cx: g.cx,
      cy: g.cy,
      r: seg.r1 + seg.shadow + px.labelOffset * s.lineScale,
      angle: seg.a0,
    });
    if (seg.genderA !== null && seg.city.maleShare !== null) {
      drawGenderLabel(p, g, seg, seg.city.maleShare, s.lineScale, s.textScale);
    }
  }
  p.pop();
}

/** Mix a hex colour toward white. `t` is 0 for the colour itself and 1 for white. */
function lighten(hex: string, t: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const value = (n >> shift) & 255;
    return Math.round(value + (255 - value) * t);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function drawGuides(p: p5, g: DonutGeometry, lineScale: number): void {
  p.stroke(c.commute);
  p.strokeWeight(theme.stroke.thin * lineScale);
  for (const guide of g.guides) {
    setDash(p, guide.style, lineScale);
    ringOutline(p, g.cx, g.cy, guide.r);
  }
  setDash(p, 'none');
}

/** One city segment with all its channels. Exported for the legend. */
export function drawSegment(
  p: p5,
  g: DonutGeometry,
  seg: Segment,
  s: Pick<
    DonutStyle,
    | 'lineScale'
    | 'textScale'
    | 'zoom'
    | 'detail'
    | 'hoverCityId'
    | 'hoverCountry'
    | 'sectorFilter'
    | 'details'
  > & {
    hoverLabelOnSegment?: boolean;
    /** Leave the city name off. The legend uses the hover sentence instead. */
    omitCityName?: boolean;
    /** Paper fill, so the legend diagram stays white (Figma 360:6643). */
    plain?: boolean;
    /** Draw the gender tick and its percent. The legend draws its own. */
    genderMark?: boolean;
  },
): void {
  const hovered = s.hoverCountry || s.hoverCityId === seg.cityId;
  const dimmed = s.hoverCityId !== null && !hovered;
  const tone = (hex: string) => (dimmed ? lighten(hex, d.dimAlpha) : hex);
  // null keeps every colour. 'none' matches no segment, so every fill goes to paper.
  const filteredOut = s.sectorFilter !== null && seg.sector !== s.sectorFilter;
  const line = theme.stroke.thin * s.lineScale;
  const step = s.detail === 'mark' ? theme.canvas.arcStepCoarse : theme.canvas.arcStep;

  if (seg.shadow > 0) {
    p.noStroke();
    p.fill(tone(hovered ? c.shadowHover : c.shadow));
    annularSector(p, g.cx, g.cy, seg.r1, seg.r1 + seg.shadow, seg.a0, seg.a1, step);
  }

  const sector = s.plain || filteredOut || !seg.sector ? c.paper : c.sector[seg.sector];
  p.fill(tone(sector));
  p.stroke(c.ink);
  p.strokeWeight(hovered ? theme.stroke.hover * s.lineScale : line);
  annularSector(p, g.cx, g.cy, seg.r0, seg.r1, seg.a0, seg.a1, step);

  if (s.detail === 'full' && seg.hatchA1 !== null && seg.hatchA1 > seg.a0) {
    const area = { cx: g.cx, cy: g.cy, r0: seg.r0, r1: seg.r1, a0: seg.a0, a1: seg.hatchA1 };
    const mid = polar(g.cx, g.cy, (seg.r0 + seg.r1) / 2, (seg.a0 + seg.hatchA1) / 2);
    withSectorClip(p, area, () => {
      p.stroke(c.ink);
      p.strokeWeight(line);
      hatchLines(p, mid.x, mid.y, seg.r1, px.hatchSpacing * s.lineScale, px.hatchAngle);
    });
    p.strokeWeight(line);
    radialLine(p, g.cx, g.cy, seg.r0, seg.r1, seg.hatchA1);
  }

  if (seg.missingCommute) {
    p.noFill();
    p.stroke(c.mutedDark);
    setDash(p, 'dashed', s.lineScale);
    p.arc(g.cx, g.cy, seg.r0 * 2, seg.r0 * 2, seg.a0, seg.a1);
    setDash(p, 'none');
  }

  const roomForLabels = s.detail === 'full' && (seg.a1 - seg.a0) * seg.r1 * s.zoom >= d.minLabelArc;
  if (seg.genderA !== null && s.genderMark !== false) {
    drawGender(p, g, seg, s.lineScale, s.textScale, s.details && roomForLabels);
  }
  const showName =
    s.omitCityName !== true && (s.hoverCityId !== seg.cityId || s.hoverLabelOnSegment === true);
  if (s.details && roomForLabels && showName) {
    p.noStroke();
    p.fill(c.ink);
    p.textSize(theme.font.xs * s.textScale);
    arcText(p, seg.city.name, {
      cx: g.cx,
      cy: g.cy,
      r: seg.r1 + seg.shadow + px.labelOffset * s.lineScale,
      angle: seg.a0,
    });
  }
}

/** Dotted radial divider, inward leader, percent toward the centre (Figma 347:6710). */
function drawGender(
  p: p5,
  g: DonutGeometry,
  seg: Segment,
  lineScale: number,
  textScale: number,
  withLabel: boolean,
): void {
  const share = seg.city.maleShare;
  if (seg.genderA === null || share === null) return;
  const line = theme.stroke.thin * lineScale;
  p.stroke(c.ink);
  p.strokeWeight(line);
  setDash(p, 'dotted', lineScale);
  radialLine(p, g.cx, g.cy, seg.r0, seg.r1, seg.genderA);
  setDash(p, 'none');
  const angle = seg.genderA;
  const boundary = polar(g.cx, g.cy, seg.r0, angle);
  const inner = polar(g.cx, g.cy, seg.r0 - genderTick(lineScale), angle);
  p.line(boundary.x, boundary.y, inner.x, inner.y);
  if (!withLabel) return;
  drawGenderLabel(p, g, seg, share, lineScale, textScale);
}

function genderTick(lineScale: number): number {
  return px.genderTick * lineScale;
}

interface GenderLayout {
  /** Inward tip of the leader. */
  leaderEnd: Point;
  /** Unit vector from the tip toward the donut centre. */
  inward: Point;
  lateral: Point;
  side: number;
}

function genderLayout(
  g: DonutGeometry,
  seg: Segment,
  share: number,
  lineScale: number,
): GenderLayout {
  const angle = seg.genderA!;
  const tick = genderTick(lineScale);
  const leaderEnd = polar(g.cx, g.cy, seg.r0 - tick, angle);
  const outward = { x: Math.cos(angle), y: Math.sin(angle) };
  const inward = { x: -outward.x, y: -outward.y };
  const lateral = normalize({ x: -outward.y, y: outward.x });
  const majorityAngle =
    share > 0.5 ? (seg.a0 + angle) / 2 : share < 0.5 ? (angle + seg.a1) / 2 : angle;
  const majority = polar(g.cx, g.cy, seg.r0 - tick * 0.4, majorityAngle);
  const side =
    Math.sign((majority.x - leaderEnd.x) * lateral.x + (majority.y - leaderEnd.y) * lateral.y) || 1;
  return { leaderEnd, inward, lateral, side };
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  return len < 1e-6 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

function shift(origin: Point, dir: Point, dist: number): Point {
  return { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist };
}

/** How far an axis-aligned pill centre must sit along `dir` so the pill clears the origin. */
function pillClearance(dir: Point, w: number, h: number, pad: number): number {
  return Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2) + pad;
}

/** Horizontal percent just inside the leader tip, facing the centre. Symbol beside the line. */
function drawGenderLabel(
  p: p5,
  g: DonutGeometry,
  seg: Segment,
  share: number,
  lineScale: number,
  textScale: number,
): void {
  const pill = {
    height: px.genderPill.height * textScale,
    padX: px.genderPill.padX * textScale,
    radius: px.genderPill.radius * textScale,
  };
  const symSize = px.genderSymbolSize * textScale;
  const layout = genderLayout(g, seg, share, lineScale);
  const label = share === 0.5 ? '50%' : formatPercent(share > 0.5 ? share : 1 - share);

  p.textSize(theme.font.xs * textScale);
  p.textFont(theme.font.family);
  const textW = p.textWidth(label);
  const pillW = textW + pill.padX * 2;
  const gap = pillClearance(layout.inward, pillW, pill.height, 3 * lineScale);
  const pillCenter = shift(layout.leaderEnd, layout.inward, gap);
  const symbolAt = shift(
    shift(layout.leaderEnd, layout.inward, -symSize * 0.2),
    layout.lateral,
    layout.side * (symSize * 0.7 + 4 * textScale),
  );

  p.stroke(c.ink);
  if (share === 0.5) {
    drawGenderPill(p, label, pillCenter.x, pillCenter.y, pill);
    drawVenusSymbol(p, symbolAt.x - 8 * textScale, symbolAt.y, symSize, lineScale);
    drawMarsSymbol(p, symbolAt.x + 8 * textScale, symbolAt.y, symSize, lineScale);
    return;
  }

  if (share > 0.5) drawMarsSymbol(p, symbolAt.x, symbolAt.y, symSize, lineScale);
  else drawVenusSymbol(p, symbolAt.x, symbolAt.y, symSize, lineScale);
  drawGenderPill(p, label, pillCenter.x, pillCenter.y, pill);
}

function drawGenderPill(
  p: p5,
  text: string,
  cx: number,
  cy: number,
  pill: { height: number; padX: number; radius: number },
): void {
  p.textFont(theme.font.family);
  const textW = p.textWidth(text);
  const w = textW + pill.padX * 2;
  const h = pill.height;
  const x = cx - w / 2;
  const y = cy - h / 2;
  p.noStroke();
  p.fill(c.paper);
  roundRectFill(p, x, y, w, h, pill.radius);
  p.fill(c.ink);
  p.textAlign(p.CENTER, p.CENTER);
  p.text(text, cx, cy);
}

interface HoverLayout {
  /** `arc` when both lines fit on the segment; otherwise they share the hole. */
  place: 'arc' | 'center';
  people: TextRun[];
  commuter: string | null;
  /** Working-people line, on the city-name radius. Commuter rate sits further out. */
  commuterR: number;
  peopleR: number;
  /** Both lines share the segment's start edge. */
  angle: number;
  /** Shared angle so both lines mirror together instead of one of them turning around. */
  orientAt: number;
}

/**
 * Working people keeps the city name's radius, so the name does not jump.
 * The commuter rate, when there is one, sits one line further out.
 * Both lines share the segment's start edge. If either would enter the next
 * segment, or cross the horizontal and flip, both move into the hole instead.
 */
function layoutHover(p: p5, seg: Segment, textScale: number, lineScale: number): HoverLayout {
  p.textFont(theme.font.family);
  p.textSize(theme.font.xs * textScale);
  p.textStyle(p.NORMAL);
  const people: TextRun[] = [
    { text: seg.city.name, bold: true },
    { text: ` has ${formatInt(seg.city.workingPeople)} working people` },
  ];
  const commuter =
    seg.city.commuterRate === null
      ? null
      : `commuter-rate of ${formatPercent(seg.city.commuterRate)}`;
  const labelR = seg.r1 + seg.shadow + px.labelOffset * lineScale;
  const peopleR = labelR;
  const commuterR = commuter === null ? labelR : labelR + (theme.font.xs + px.hoverGap) * textScale;
  const peopleSpan = measureRuns(p, people) / peopleR;
  const commuterSpan = commuter === null ? 0 : textSpanWidth(p, commuter) / commuterR;
  const maxSpan = Math.max(peopleSpan, commuterSpan);
  const nameSpan = textSpanWidth(p, seg.city.name) / labelR;
  const fits = labelFitsSegment(seg.a0, seg.a1, maxSpan);
  return {
    place: fits ? 'arc' : 'center',
    people,
    commuter,
    commuterR,
    peopleR,
    angle: seg.a0,
    orientAt: seg.a0 + nameSpan / 2,
  };
}

/** Same width arcText uses: sum of glyph advances, so the fit check matches the drawn line. */
function measureRuns(p: p5, runs: TextRun[]): number {
  let width = 0;
  for (const run of runs) {
    p.textStyle(run.bold ? p.BOLD : p.NORMAL);
    width += textSpanWidth(p, run.text);
  }
  p.textStyle(p.NORMAL);
  return width;
}

function textSpanWidth(p: p5, text: string): number {
  let width = 0;
  for (const ch of text) width += p.textWidth(ch);
  return width;
}

/**
 * The hover lines for one city: "**Paris** has 5'172'658 working people" and,
 * when known, "commuter-rate of 30%". `paint` draws them after the segment.
 */
export function segmentHover(
  p: p5,
  seg: Segment,
  textScale: number,
  lineScale = 1,
): { place: 'arc' | 'center'; paint: (g: DonutGeometry) => void } {
  const layout = layoutHover(p, seg, textScale, lineScale);
  return {
    place: layout.place,
    paint: (g) => drawHoverInfo(p, g, layout, textScale),
  };
}

/** "<b>Paris</b> has 5'172'658 working people", with the commuter rate on the line below. */
function drawHoverInfo(p: p5, g: DonutGeometry, layout: HoverLayout, textScale: number): void {
  if (layout.place === 'center') {
    drawCenterHover(p, g, layout, textScale);
    return;
  }
  p.noStroke();
  p.fill(c.ink);
  p.textSize(theme.font.xs * textScale);
  p.textFont(theme.font.family);
  const placed = { angle: layout.angle, orientAt: layout.orientAt };
  arcText(p, layout.people, { cx: g.cx, cy: g.cy, r: layout.peopleR, ...placed });
  if (!layout.commuter) return;
  arcText(p, layout.commuter, { cx: g.cx, cy: g.cy, r: layout.commuterR, ...placed });
}

/** Both hover lines in the hole. The country name is left out by the caller. */
function drawCenterHover(p: p5, g: DonutGeometry, layout: HoverLayout, textScale: number): void {
  p.textFont(theme.font.family);
  p.textSize(theme.font.xs * textScale);
  const maxWidth = g.R * d.baseline * 1.6;
  const peopleWidth = measureRuns(p, layout.people);
  const commuterWidth = layout.commuter === null ? 0 : textSpanWidth(p, layout.commuter);
  const widest = Math.max(peopleWidth, commuterWidth);
  const size =
    widest > maxWidth && widest > 0
      ? (theme.font.xs * textScale * maxWidth) / widest
      : theme.font.xs * textScale;
  p.textSize(size);
  p.noStroke();
  p.fill(c.ink);
  if (layout.commuter === null) {
    drawRunLine(p, layout.people, g.cx, g.cy);
    return;
  }
  const leading = p.textAscent() + p.textDescent() + px.hoverGap * textScale;
  drawRunLine(p, layout.people, g.cx, g.cy - leading / 2);
  p.textStyle(p.NORMAL);
  p.textAlign(p.CENTER, p.CENTER);
  p.text(layout.commuter, g.cx, g.cy + leading / 2);
}

function drawRunLine(p: p5, runs: TextRun[], x: number, y: number): void {
  const widths = runs.map((run) => {
    p.textStyle(run.bold ? p.BOLD : p.NORMAL);
    return p.textWidth(run.text);
  });
  const total = widths.reduce((sum, w) => sum + w, 0);
  let cursor = x - total / 2;
  p.textAlign(p.LEFT, p.CENTER);
  p.noStroke();
  p.fill(c.ink);
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (!run) continue;
    p.textStyle(run.bold ? p.BOLD : p.NORMAL);
    p.text(run.text, cursor, y);
    cursor += widths[i] ?? 0;
  }
  p.textStyle(p.NORMAL);
}

/** Three dots in the opening of a single-city ring. */
function drawEllipsis(p: p5, g: DonutGeometry, lineScale: number): void {
  if (g.ellipsis.length === 0) return;
  p.noStroke();
  p.fill(c.ink);
  const diameter = px.ellipsisDot * lineScale;
  for (const dot of g.ellipsis) p.circle(dot.x, dot.y, diameter);
}

/** Name ring for each selected country. Single cities have no ring of their own. */
function drawGroupBrackets(p: p5, g: DonutGeometry, s: DonutStyle): void {
  const named = g.groups.filter((group) => group.bracket !== false);
  if (named.length === 0) return;
  const r = g.R * d.groupRing;
  p.stroke(c.ink);
  p.strokeWeight(theme.stroke.thin * s.lineScale);
  p.noFill();
  for (const group of named) {
    const start = group.a0 - d.gap / 2;
    const end = group.a1 + d.gap / 2;
    p.arc(g.cx, g.cy, r * 2, r * 2, start + d.groupGap, end - d.groupGap);
    const tick = d.groupTick * s.lineScale;
    radialLine(p, g.cx, g.cy, r, r + tick, start);
    radialLine(p, g.cx, g.cy, r, r + tick, end);
  }
  if (s.detail !== 'full') return;
  p.noStroke();
  p.fill(c.ink);
  p.textSize(theme.font.xs * s.textScale);
  for (const group of named) {
    const start = group.a0 - d.gap / 2;
    const gap = px.labelOffset * s.lineScale;
    arcText(p, (group.label ?? s.groupLabel(group.countryId)).toUpperCase(), {
      cx: g.cx,
      cy: g.cy,
      r: r + gap,
      angle: start + gap / r,
    });
  }
}

function drawCenterLabel(
  p: p5,
  g: DonutGeometry,
  label: string,
  textScale: number,
  lineScale = 1,
): void {
  p.noStroke();
  p.fill(c.ink);
  p.textAlign(p.CENTER, p.CENTER);
  const size = theme.font.s * textScale;
  p.textSize(size);
  const maxWidth = g.R * d.baseline * 1.6;
  const width = p.textWidth(label);
  if (width > maxWidth) {
    const fitted = (size * maxWidth) / width;
    // Prefer fitting the hole, but never drop below ~font.s screen px (may overflow).
    const minReadable = theme.font.s * lineScale;
    p.textSize(Math.max(fitted, Math.min(size, minReadable)));
  }
  p.text(label, g.cx, g.cy);
}
