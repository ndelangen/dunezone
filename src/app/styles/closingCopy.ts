import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/*
 * A close animation for something that leaves at once. Whoever closes it keeps their instant answer (focus, the next
 * menu, assistive technology and the hosted verifiers all see it gone), and a lifeless copy left in its place plays the
 * close: hidden from assistive technology, inert, nameless, marked `data-closing` for its stylesheet, and gone once its
 * own animation ends or `ms` passes, whichever is first.
 *
 * React's strict development pass unmounts and remounts with the element still in the page; then nothing closed and no
 * copy is left.
 */
export function useClosingCopy(
  element: RefObject<HTMLElement | null>,
  { enabled, ms, strip = [] }: Readonly<{ enabled: boolean; ms: number; strip?: readonly string[] }>
) {
  /* Read when it closes, not when it opened, so a motion switch flipped while open still counts. */
  const latest = useRef({ enabled, ms, strip });
  useLayoutEffect(() => {
    latest.current = { enabled, ms, strip };
  });
  useLayoutEffect(() => {
    const node = element.current;
    return () => {
      const { enabled: on, ms: duration, strip: names } = latest.current;
      if (node && on) {
        leaveCopy(node, duration, names);
      }
    };
  }, [element]);
}

function leaveCopy(node: HTMLElement, ms: number, strip: readonly string[]) {
  const parent = node.parentNode;
  const next = node.nextSibling;
  const copy = node.cloneNode(true) as HTMLElement;
  queueMicrotask(() => {
    if (node.isConnected || !parent?.isConnected) {
      return;
    }
    for (const entry of [copy, ...copy.querySelectorAll('*')]) {
      for (const name of ['role', 'id', 'aria-label', 'aria-labelledby', 'aria-describedby', 'tabindex']) {
        entry.removeAttribute(name);
      }
    }
    for (const name of strip) {
      copy.removeAttribute(name);
    }
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.dataset.closing = '';
    const remove = () => copy.remove();
    copy.addEventListener('animationend', (event) => event.target === copy && remove());
    setTimeout(remove, ms);
    parent.insertBefore(copy, next?.parentNode === parent ? next : null);
  });
}
