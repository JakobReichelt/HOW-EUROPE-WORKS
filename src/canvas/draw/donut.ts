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
import { wordAlphas } from '../anim/wordReveal';
import { labelFitsSegment, type DonutGeometry, type Segment } from '../layout/donutLayout';
import type { DetailLevel } from '../view/visibility';
import { polar, type Point } from '../geometry';
import {
  annularSector,
  arcText,
  ctx2d,
  hatchAnnularSector,
  radialLine,
  ringOutline,
  setDash,
  drawMarsSymbol,
  drawVenusSymbol,
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
  /** Hovered city: darker band. Other segments lighten. */
  hoverCityId: string | null;
  /**
   * Draw the people / commuter hover copy for `hoverCityId`. Select view turns this on
   * and always places the copy in the hole; overview leaves it off.
   */
  hoverInfo: boolean;
  /** Whole donut is hovered: darker band on every segment. */
  hoverCountry: boolean;
  /**
   * Soft 0..1 hover amount per city. When set, overrides the boolean hover for tone / stroke.
   * Missing cities count as 0.
   */
  hoverMix?: (cityId: string) => number;
  /** Soft 0..1 whole-donut hover. Blended with hoverMix. */
  countryMix?: number;
  /**
   * Soft 0..1 "a city of this donut is hovered". Other segments lighten by this minus
   * their own mix. Falls back to the strongest city mix when omitted.
   */
  dimMix?: number;
  /** Elapsed ms since the current city hover began; drives the word-by-word reveal. */
  hoverRevealMs?: number;
  sectorFilter: SectorFilter;
  /** Text in the centre (country name), null for none. */
  label: string | null;
  /** Bracket label per country in combined donuts. */
  groupLabel: (countryId: string) => string;
  /** City names along the segments and gender labels. */
  details: boolean;
  /**
   * Gender tick, dotted split and symbol stroke, in this donut's coordinates.
   * The legend uses 1 (screen px). Overview passes 1 / zoom so the same icon
   * stays that screen size under the camera. Defaults to `lineScale`.
   */
  genderScale: number;
  /** Overall opacity. */
  alpha: number;
  /** City left out of this draw, because it is being dragged elsewhere. */
  omitCityId: string | null;
  /** Draw outer country brackets on combined donuts. */
  brackets: boolean;
}

export const defaultDonutStyle: DonutStyle = {
  lineScale: 1,
  textScale: 1,
  zoom: 1,
  detail: 'full',
  hoverCityId: null,
  hoverInfo: false,
  hoverCountry: false,
  sectorFilter: null,
  label: null,
  groupLabel: (countryId) => countryId,
  details: true,
  genderScale: 1,
  alpha: 1,
  omitCityId: null,
  brackets: true,
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
  const hovered =
    s.hoverInfo && s.hoverCityId
      ? g.segments.find((seg) => seg.cityId === s.hoverCityId && seg.cityId !== s.omitCityId)
      : undefined;
  const hover = hovered
    ? { ...layoutHover(p, hovered, s.textScale, s.lineScale), place: 'center' as const }
    : null;
  for (const seg of g.segments) {
    if (seg.cityId === s.omitCityId) continue;
    ctx.globalAlpha = s.alpha;
    drawSegment(p, g, seg, s);
  }
  ctx.globalAlpha = s.alpha;
  drawEllipsis(p, g, s.lineScale);
  if (s.brackets && g.groups.length > 1) drawGroupBrackets(p, g, s);
  if (s.label && !hover) {
    drawCenterLabel(p, g, s.label, centerLabelScale(s), s.lineScale);
  } else if (s.label && hover) {
    const reveal = s.hoverRevealMs ?? 0;
    const fade = Math.max(0, 1 - reveal / Math.max(1, theme.motion.wordFadeMs));
    if (fade > 0.01) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = s.alpha * fade;
      drawCenterLabel(p, g, s.label, centerLabelScale(s), s.lineScale);
      ctx.globalAlpha = prev;
    }
  }
  if (hover) drawHoverInfo(p, g, hover, s.textScale, s.hoverRevealMs ?? 0);
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
  ctx2d(p).globalAlpha = s.alpha;
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
      drawGenderLabel(p, g, seg, seg.city.maleShare, genderScaleOf(s), s.textScale);
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

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/** Mix two hex colours. `t` is 0 for `a` and 1 for `b`. Returns `#rrggbb` so `lighten` can chain it. */
function mixHex(a: string, b: string, t: number): string {
  const na = Number.parseInt(a.slice(1), 16);
  const nb = Number.parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const va = (na >> shift) & 255;
    const vb = (nb >> shift) & 255;
    return toHex(va + (vb - va) * t);
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
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
    | 'hoverMix'
    | 'countryMix'
    | 'dimMix'
    | 'sectorFilter'
    | 'details'
  > & {
    hoverLabelOnSegment?: boolean;
    /** Screen size of the gender mark, in this geometry's units. Defaults to lineScale. */
    genderScale?: number;
    /** Leave the city name off. The legend uses the hover sentence instead. */
    omitCityName?: boolean;
    /** Paper fill, so the legend diagram stays white (Figma 360:6643). */
    plain?: boolean;
    /** Draw the gender tick and its percent. */
    genderMark?: boolean;
  },
): void {
  const useSoft = s.hoverMix !== undefined || s.countryMix !== undefined;
  const selfMix = useSoft
    ? Math.max(s.hoverMix?.(seg.cityId) ?? 0, s.countryMix ?? 0)
    : s.hoverCountry || s.hoverCityId === seg.cityId
      ? 1
      : 0;
  const peak = useSoft
    ? (s.dimMix ?? Math.max(0, ...g.segments.map((other) => s.hoverMix?.(other.cityId) ?? 0)))
    : s.hoverCityId !== null
      ? 1
      : 0;
  const dimAmount = d.dimAlpha * Math.max(0, peak - selfMix);
  const tone = (hex: string) => (dimAmount > 0 ? lighten(hex, dimAmount) : hex);
  // null keeps every colour. 'none' matches no segment, so every fill goes to paper.
  const filteredOut = s.sectorFilter !== null && seg.sector !== s.sectorFilter;
  const line = theme.stroke.thin * s.lineScale;
  const hoverLine = theme.stroke.hover * s.lineScale;
  const step = s.detail === 'mark' ? theme.canvas.arcStepCoarse : theme.canvas.arcStep;

  if (seg.shadow > 0) {
    p.noStroke();
    const shadowFill =
      selfMix <= 0
        ? tone(c.shadow)
        : selfMix >= 1
          ? tone(c.shadowHover)
          : tone(mixHex(c.shadow, c.shadowHover, selfMix));
    p.fill(shadowFill);
    annularSector(p, g.cx, g.cy, seg.r1, seg.r1 + seg.shadow, seg.a0, seg.a1, step);
  }

  const sector = s.plain || filteredOut || !seg.sector ? c.paper : c.sector[seg.sector];
  p.fill(tone(sector));
  p.stroke(c.ink);
  p.strokeWeight(line + (hoverLine - line) * selfMix);
  annularSector(p, g.cx, g.cy, seg.r0, seg.r1, seg.a0, seg.a1, step);

  if (s.detail === 'full' && seg.hatchA1 !== null && seg.hatchA1 > seg.a0) {
    hatchAnnularSector(
      p,
      g.cx,
      g.cy,
      seg.r0,
      seg.r1,
      seg.a0,
      seg.hatchA1,
      px.hatchSpacing * s.lineScale,
      line,
      px.hatchAngle,
      c.ink,
    );
    p.stroke(c.ink);
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
    drawGender(p, g, seg, genderScaleOf(s), s.textScale, s.details && roomForLabels);
  }
  const showName = s.omitCityName !== true;
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

/** Legend-sized gender mark. Callers that omit it keep the segment stroke scale. */
function genderScaleOf(s: { lineScale: number; genderScale?: number }): number {
  return s.genderScale ?? s.lineScale;
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
  const tick = genderTick(lineScale);
  const symbolAt = shift(
    shift(layout.leaderEnd, layout.inward, -tick * (1 - px.genderSymbolInward)),
    layout.lateral,
    layout.side * (symSize * 0.7 + 4 * textScale),
  );

  p.stroke(c.ink);
  if (share === 0.5) {
    drawGenderText(p, label, pillCenter.x, pillCenter.y);
    drawVenusSymbol(p, symbolAt.x - 8 * textScale, symbolAt.y, symSize, lineScale);
    drawMarsSymbol(p, symbolAt.x + 8 * textScale, symbolAt.y, symSize, lineScale);
    return;
  }

  if (share > 0.5) drawMarsSymbol(p, symbolAt.x, symbolAt.y, symSize, lineScale);
  else drawVenusSymbol(p, symbolAt.x, symbolAt.y, symSize, lineScale);
  drawGenderText(p, label, pillCenter.x, pillCenter.y);
}

function drawGenderText(p: p5, text: string, cx: number, cy: number): void {
  p.textFont(theme.font.family);
  p.noStroke();
  p.fill(c.ink);
  p.textAlign(p.CENTER, p.CENTER);
  p.text(text, cx, cy);
}

interface HoverLayout {
  /** `arc` when both lines fit on the segment; otherwise they share the hole. */
  place: 'arc' | 'center';
  people: TextRun[];
  /** Second line, split per word. Empty when the city has no commuter rate. */
  commuter: TextRun[];
  /** Working-people line, on the city-name radius. Commuter rate sits further out. */
  commuterR: number;
  peopleR: number;
  /** Both lines share the segment's start edge. */
  angle: number;
  /** Shared angle so both lines mirror together instead of one of them turning around. */
  orientAt: number;
  /** Total words across both lines, for the staggered reveal. */
  wordCount: number;
}

/** Split a phrase into runs of "word" + trailing space (last word has no space). */
function wordRuns(text: string, bold = false): TextRun[] {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  return parts.map((part) => ({ text: part, bold }));
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
    ...wordRuns(` has ${formatInt(seg.city.workingPeople)} working people`),
  ];
  const commuterText =
    seg.city.commuterRate === null
      ? null
      : `commuter-rate of ${formatPercent(seg.city.commuterRate)}`;
  const commuter = commuterText === null ? [] : wordRuns(commuterText);
  const labelR = seg.r1 + seg.shadow + px.labelOffset * lineScale;
  const peopleR = labelR;
  const commuterR =
    commuter.length === 0 ? labelR : labelR + (theme.font.xs + px.hoverGap) * textScale;
  const peopleSpan = measureRuns(p, people) / peopleR;
  const commuterSpan = commuter.length === 0 ? 0 : measureRuns(p, commuter) / commuterR;
  const maxSpan = Math.max(peopleSpan, commuterSpan);
  const nameSpan = textSpanWidth(p, seg.city.name) / labelR;
  const fits = labelFitsSegment(seg.a0, seg.a1, maxSpan);
  const wordCount =
    people.filter((run) => run.text.trim().length > 0).length +
    commuter.filter((run) => run.text.trim().length > 0).length;
  return {
    place: fits ? 'arc' : 'center',
    people,
    commuter,
    commuterR,
    peopleR,
    angle: seg.a0,
    orientAt: seg.a0 + nameSpan / 2,
    wordCount,
  };
}

function withReveal(runs: TextRun[], alphas: number[], offset: number): TextRun[] {
  let i = offset;
  return runs.map((run) => {
    if (run.text.trim().length === 0) return { ...run, alpha: 1 };
    const alpha = alphas[i] ?? 1;
    i += 1;
    return { ...run, alpha };
  });
}

function revealOffset(runs: TextRun[]): number {
  return runs.filter((run) => run.text.trim().length > 0).length;
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
 * Pass `place: 'center'` to keep the copy in the hole (legend).
 */
export function segmentHover(
  p: p5,
  seg: Segment,
  textScale: number,
  lineScale = 1,
  place: 'arc' | 'center' | 'auto' = 'auto',
): { place: 'arc' | 'center'; paint: (g: DonutGeometry) => void } {
  const layout = layoutHover(p, seg, textScale, lineScale);
  const resolved = place === 'auto' ? layout : { ...layout, place };
  return {
    place: resolved.place,
    paint: (g) => drawHoverInfo(p, g, resolved, textScale, Number.POSITIVE_INFINITY),
  };
}

/** "<b>Paris</b> has 5'172'658 working people", with the commuter rate on the line below. */
function drawHoverInfo(
  p: p5,
  g: DonutGeometry,
  layout: HoverLayout,
  textScale: number,
  revealMs: number,
): void {
  const alphas = wordAlphas(
    layout.wordCount,
    revealMs,
    theme.motion.wordStaggerMs,
    theme.motion.wordFadeMs,
  );
  const people = withReveal(layout.people, alphas, 0);
  const commuter = withReveal(layout.commuter, alphas, revealOffset(layout.people));
  if (layout.place === 'center') {
    drawCenterHover(p, g, people, commuter, layout, textScale);
    return;
  }
  p.noStroke();
  p.fill(c.ink);
  p.textSize(theme.font.xs * textScale);
  p.textFont(theme.font.family);
  const placed = { angle: layout.angle, orientAt: layout.orientAt };
  arcText(p, people, { cx: g.cx, cy: g.cy, r: layout.peopleR, ...placed });
  if (commuter.length === 0) return;
  arcText(p, commuter, { cx: g.cx, cy: g.cy, r: layout.commuterR, ...placed });
}

/** Both hover lines in the hole. The country name is left out by the caller. */
function drawCenterHover(
  p: p5,
  g: DonutGeometry,
  people: TextRun[],
  commuter: TextRun[],
  layout: HoverLayout,
  textScale: number,
): void {
  p.textFont(theme.font.family);
  p.textSize(theme.font.xs * textScale);
  const maxWidth = g.R * d.baseline * 1.6;
  const peopleWidth = measureRuns(p, layout.people);
  const commuterWidth = measureRuns(p, layout.commuter);
  const widest = Math.max(peopleWidth, commuterWidth);
  const size =
    widest > maxWidth && widest > 0
      ? (theme.font.xs * textScale * maxWidth) / widest
      : theme.font.xs * textScale;
  p.textSize(size);
  p.noStroke();
  p.fill(c.ink);
  if (commuter.length === 0) {
    drawRunLine(p, people, g.cx, g.cy);
    return;
  }
  const leading = p.textAscent() + p.textDescent() + px.hoverGap * textScale;
  drawRunLine(p, people, g.cx, g.cy - leading / 2);
  drawRunLine(p, commuter, g.cx, g.cy + leading / 2);
}

function drawRunLine(p: p5, runs: TextRun[], x: number, y: number): void {
  const widths = runs.map((run) => {
    p.textStyle(run.bold ? p.BOLD : p.NORMAL);
    return p.textWidth(run.text);
  });
  const total = widths.reduce((sum, w) => sum + w, 0);
  let cursor = x - total / 2;
  const ctx = ctx2d(p);
  const baseAlpha = ctx.globalAlpha;
  p.textAlign(p.LEFT, p.CENTER);
  p.noStroke();
  p.fill(c.ink);
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (!run) continue;
    const alpha = run.alpha ?? 1;
    if (alpha <= 0) {
      cursor += widths[i] ?? 0;
      continue;
    }
    p.textStyle(run.bold ? p.BOLD : p.NORMAL);
    ctx.globalAlpha = baseAlpha * alpha;
    p.text(run.text, cursor, y);
    cursor += widths[i] ?? 0;
  }
  ctx.globalAlpha = baseAlpha;
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
