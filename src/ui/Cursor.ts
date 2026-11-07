/** Custom circle cursor: white with black stroke; fills black over clickable targets. */
import type { Store } from '../state/store';
import type { AppState } from '../state/types';

const CLICKABLE = 'button, a[href], [role="button"], summary, input, select, textarea, label';

function prefersFinePointer(): boolean {
  return window.matchMedia('(pointer: fine)').matches;
}

function isDomClickable(el: Element | null): boolean {
  if (!el) return false;
  const hit = el.closest(CLICKABLE);
  if (!hit || !(hit instanceof HTMLElement)) return false;
  if (hit.hidden || hit.getAttribute('aria-disabled') === 'true') return false;
  if (hit instanceof HTMLButtonElement && hit.disabled) return false;
  if (hit instanceof HTMLInputElement && hit.disabled) return false;
  return true;
}

function isCanvasClickable(state: AppState, el: Element | null): boolean {
  if (!el || el.tagName !== 'CANVAS') return false;
  return state.hover.countryId !== null || state.hover.cityId !== null;
}

/**
 * Mounts a document-level cursor on `document.body`. No-ops on coarse pointers
 * (touch) so the system cursor stays available.
 */
export function mountCursor(store: Store<AppState>): () => void {
  if (!prefersFinePointer()) return () => undefined;

  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  document.documentElement.classList.add('has-custom-cursor');

  let visible = false;
  let x = 0;
  let y = 0;

  const setVisible = (next: boolean) => {
    if (next === visible) return;
    visible = next;
    el.classList.toggle('is-visible', next);
  };

  const setActive = (next: boolean) => {
    el.classList.toggle('is-active', next);
  };

  const refreshActive = (state: AppState = store.getState()) => {
    const under = document.elementFromPoint(x, y);
    setActive(isDomClickable(under) || isCanvasClickable(state, under));
  };

  const syncAt = (clientX: number, clientY: number) => {
    x = clientX;
    y = clientY;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    refreshActive();
    setVisible(true);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    syncAt(e.clientX, e.clientY);
  };

  const onLeave = () => setVisible(false);

  const unsub = store.subscribe((state, previous) => {
    if (
      state.hover.countryId === previous.hover.countryId &&
      state.hover.cityId === previous.hover.cityId
    ) {
      return;
    }
    if (!visible) return;
    refreshActive(state);
  });

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerdown', onMove);
  document.documentElement.addEventListener('mouseleave', onLeave);
  window.addEventListener('blur', onLeave);

  return () => {
    unsub();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerdown', onMove);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    window.removeEventListener('blur', onLeave);
    el.remove();
    document.documentElement.classList.remove('has-custom-cursor');
  };
}
