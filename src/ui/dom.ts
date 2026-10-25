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

/** Arrow glyphs used in Figma labels. */
export const ARROW = { right: '\u2192', left: '\u2190', up: '\u2191', down: '\u2193' } as const;
