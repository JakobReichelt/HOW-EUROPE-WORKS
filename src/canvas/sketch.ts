/**
 * The only p5 instance. Owns the canvas, routes input to the active scene and redraws on demand:
 * noLoop() + one redraw per animation frame when state or local scene visuals changed.
 * Pointer moves that do not change hover, camera or drag do not paint.
 */
import p5 from 'p5';
import { theme } from '../config/theme';
import type { DataIndex } from '../data/selectors';
import type { Actions } from '../state/actions';
import type { Store } from '../state/store';
import type { AppState, SceneId } from '../state/types';
import { ExploreScene } from './scenes/ExploreScene';
import { IntroScene } from './scenes/IntroScene';
import { LandingScene } from './scenes/LandingScene';
import { viewportFor, type PointerInput, type Scene, type SceneContext } from './scenes/Scene';

export interface CanvasHandle {
  /** Schedule a redraw on the next animation frame. */
  requestRedraw(): void;
  /** Debug snapshot of the active scene. */
  inspect(): unknown;
  /** Hit test at canvas pixel coordinates (explore only). */
  hitAt(x: number, y: number): unknown;
  destroy(): void;
}

export interface SketchDeps {
  store: Store<AppState>;
  actions: Actions;
  data: DataIndex;
}

export function mountSketch(root: HTMLElement, deps: SketchDeps): CanvasHandle {
  const { store, actions, data } = deps;
  let p: p5 | null = null;
  let frameRequested = false;

  const requestRedraw = () => {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      p?.redraw();
    });
  };

  const explore = new ExploreScene(data, requestRedraw);
  const scenes: Record<SceneId, Scene> = {
    landing: new LandingScene(),
    intro: new IntroScene(),
    explore,
  };

  let activeScene: SceneId | null = null;

  const context = (instance: p5): SceneContext => {
    const state = store.getState();
    return {
      p: instance,
      state,
      data,
      actions,
      viewport: viewportFor(state.scene, instance.width, instance.height),
    };
  };

  const withScene = (fn: (scene: Scene, ctx: SceneContext) => boolean | void) => {
    if (!p) return;
    const ctx = context(p);
    if (fn(scenes[ctx.state.scene], ctx)) requestRedraw();
  };

  const bindInput = (el: HTMLCanvasElement) => {
    const input = (e: PointerEvent | WheelEvent): PointerInput => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, button: e.button };
    };
    el.tabIndex = 0;
    el.setAttribute('role', 'img');
    el.dataset.testid = 'canvas';
    el.addEventListener('pointerdown', (e) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events (tests, __HEW__ scripts) have no active pointer to capture.
      }
      withScene((s, ctx) => s.pointerDown?.(ctx, input(e)));
    });
    el.addEventListener('pointermove', (e) =>
      withScene((s, ctx) => s.pointerMove?.(ctx, input(e))),
    );
    el.addEventListener('pointerup', (e) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      withScene((s, ctx) => s.pointerUp?.(ctx, input(e)));
    });
    el.addEventListener('pointerleave', () => withScene((s, ctx) => s.pointerLeave?.(ctx)));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        withScene((s, ctx) => s.wheel?.(ctx, { ...input(e), deltaY: e.deltaY }));
      },
      { passive: false },
    );
    el.addEventListener('keydown', (e) => {
      withScene((s, ctx) => {
        const handled = s.key?.(ctx, e.key) ?? false;
        if (handled) e.preventDefault();
        return handled;
      });
    });
  };

  const instance = new p5((sketch: p5) => {
    p = sketch;
    sketch.setup = () => {
      sketch.pixelDensity(Math.min(sketch.displayDensity(), theme.canvas.maxPixelRatio));
      const canvas = sketch.createCanvas(root.clientWidth, root.clientHeight);
      sketch.noLoop();
      sketch.textFont(theme.font.family);
      bindInput(canvas.elt as HTMLCanvasElement);
    };
    sketch.draw = () => {
      const ctx = context(sketch);
      const scene = scenes[ctx.state.scene];
      if (activeScene !== ctx.state.scene) {
        const from = activeScene;
        activeScene = ctx.state.scene;
        scene.enter?.(ctx, from);
      }
      sketch.clear();
      sketch.background(theme.color.paper);
      scene.draw(ctx);
      (sketch.drawingContext as CanvasRenderingContext2D).canvas.setAttribute(
        'aria-label',
        scene.describe(ctx),
      );
    };
    sketch.windowResized = () => {
      sketch.resizeCanvas(root.clientWidth, root.clientHeight);
    };
  }, root);

  const unsubscribe = store.subscribe(requestRedraw);

  return {
    requestRedraw,
    inspect: () => {
      if (!p) return null;
      const ctx = context(p);
      return {
        scene: ctx.state.scene,
        ...((scenes[ctx.state.scene].inspect?.(ctx) as object) ?? {}),
      };
    },
    hitAt: (x, y) => (p ? explore.hitAt(context(p), { x, y }) : null),
    destroy: () => {
      unsubscribe();
      explore.destroy();
      instance.remove();
    },
  };
}
