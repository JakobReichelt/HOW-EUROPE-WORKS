/**
 * Maps the 1536 x 960 intro frame onto the window.
 * At the design size (or larger) coordinates are 1:1 from the top-left, so the
 * strip and the chart sit where Figma puts them. Smaller windows scale down.
 */
import { theme } from './theme';

export interface IntroFrame {
  scale: number;
  ox: number;
  oy: number;
}

export function introFrame(width: number, height: number): IntroFrame {
  const { width: dw, height: dh } = theme.layout.design;
  const scale = Math.min(1, width / dw, height / dh);
  return { scale, ox: 0, oy: 0 };
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
