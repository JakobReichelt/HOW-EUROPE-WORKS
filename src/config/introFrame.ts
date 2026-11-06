/**
 * Fits the 1536 x 960 frame inside the window.
 * The story (the bar, the copy above it, next below it) sits left of the
 * artboard centre. On a larger screen the frame shifts until that point is
 * in the middle, and stops at the screen edge so the artboard stays whole.
 */
import { theme } from './theme';

export interface IntroFrame {
  scale: number;
  ox: number;
  oy: number;
}

/** Centre of the intro story on the artboard. */
function storyAnchor(): { x: number; y: number } {
  const intro = theme.intro;
  return {
    x: intro.box.x + intro.box.w / 2,
    y: (intro.copy.opening.y + intro.nav.next.y) / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function introFrame(width: number, height: number): IntroFrame {
  const { width: dw, height: dh } = theme.layout.design;
  const scale = Math.min(width / dw, height / dh);
  const anchor = storyAnchor();
  return {
    scale,
    ox: clamp(width / 2 - anchor.x * scale, 0, Math.max(0, width - dw * scale)),
    oy: clamp(height / 2 - anchor.y * scale, 0, Math.max(0, height - dh * scale)),
  };
}

/** Canvas pixels of the Switzerland donut on the last intro step. */
export function introDonutScreen(
  width: number,
  height: number,
): { x: number; y: number; r: number } {
  const frame = introFrame(width, height);
  const donut = theme.intro.donut;
  return {
    x: frame.ox + donut.cx * frame.scale,
    y: frame.oy + donut.cy * frame.scale,
    r: donut.R * frame.scale,
  };
}
