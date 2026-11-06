/**
 * Scene contract. One scene per AppState.scene; the sketch routes drawing and input to the active one.
 * Scenes read state from ctx.state and change it only through ctx.actions.
 * Purely visual state (camera, drag in progress) may live inside the scene.
 */
import type p5 from 'p5';
import { introFrame } from '../../config/introFrame';
import { theme } from '../../config/theme';
import type { DataIndex } from '../../data/selectors';
import type { Actions } from '../../state/actions';
import type { AppState, SceneId } from '../../state/types';
import type { Point, Rect } from '../geometry';

export interface SceneContext {
  p: p5;
  state: AppState;
  data: DataIndex;
  actions: Actions;
  /** Part of the canvas not covered by DOM chrome (sidebar / intro strip). */
  viewport: Rect;
}

export interface PointerInput extends Point {
  button: number;
}

export interface Scene {
  /** `from` is the scene that was showing, or null on the first frame. */
  enter?(ctx: SceneContext, from?: SceneId | null): void;
  draw(ctx: SceneContext): void;
  /**
   * True while a local tween still needs frames (morph, hover fade, drag return).
   * The sketch keeps calling requestRedraw until this is false.
   */
  isAnimating?(): boolean;
  /**
   * Return true when this event changed local visual state (camera, drag).
   * Store updates redraw on their own; a false return skips the frame.
   */
  pointerDown?(ctx: SceneContext, e: PointerInput): boolean;
  pointerMove?(ctx: SceneContext, e: PointerInput): boolean;
  pointerUp?(ctx: SceneContext, e: PointerInput): boolean;
  pointerLeave?(ctx: SceneContext): boolean;
  wheel?(ctx: SceneContext, e: PointerInput & { deltaY: number }): boolean;
  /** Return true if the key was handled. A handled key also requests a redraw. */
  key?(ctx: SceneContext, key: string): boolean;
  /** Short text alternative for the canvas (aria-label). */
  describe(ctx: SceneContext): string;
  /** Serializable snapshot for window.__HEW__.canvas.inspect(). */
  inspect?(ctx: SceneContext): unknown;
}

export function viewportFor(scene: SceneId, width: number, height: number): Rect {
  const scale = introFrame(width, height).scale;
  const strip = theme.layout.stripWidth * scale;
  const panel = theme.layout.panelWidth * scale;
  const left = scene === 'explore' ? strip + panel : scene === 'intro' ? strip : 0;
  return { x: left, y: 0, w: Math.max(1, width - left), h: height };
}
