/** Tiny DOM helper so components stay declarative without a framework. */

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  setChildren(el, children.flat());
  return el;
}

export function setChildren(el: Element, children: Child[]): void {
  el.replaceChildren(
    ...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false),
  );
}

export function show(el: HTMLElement, visible: boolean): void {
  el.hidden = !visible;
}

/**
 * Show / hide with a CSS enter class so width or transform can tween.
 * `hidden` is cleared before the class is added, and set after the leave transition.
 * No-ops when the element is already in the requested state.
 */
export function slideShow(el: HTMLElement, visible: boolean, inClass = 'is-in'): void {
  const isIn = el.classList.contains(inClass);
  if (visible) {
    if (isIn && !el.hidden) return;
    el.hidden = false;
    // Reflow so the leave transform is the transition start point.
    void el.offsetWidth;
    el.classList.add(inClass);
    return;
  }
  if (!isIn && el.hidden) return;
  const finish = () => {
    if (!el.classList.contains(inClass)) el.hidden = true;
  };
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== el) return;
    el.removeEventListener('transitionend', onEnd);
    finish();
  };
  el.classList.remove(inClass);
  el.addEventListener('transitionend', onEnd);
  // prefers-reduced-motion zeroes the duration; some engines skip transitionend then.
  requestAnimationFrame(() => {
    const ms = parseFloat(getComputedStyle(el).transitionDuration) * 1000;
    if (!(ms > 0)) {
      el.removeEventListener('transitionend', onEnd);
      finish();
    }
  });
}

/** Arrow glyphs used in Figma labels. */
export const ARROW = { right: '\u2192', left: '\u2190', up: '\u2191', down: '\u2193' } as const;
