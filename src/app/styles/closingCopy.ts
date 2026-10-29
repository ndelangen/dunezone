import { useEffectEvent, useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/*
 * A close animation for something that leaves at once. Whoever closes it keeps their instant answer (focus, the next
 * menu, assistive technology and the hosted verifiers all see it gone), and a lifeless copy left in its place plays the
 * close: hidden from assistive technology, inert, nameless, marked `data-closing` for its stylesheet, and gone once its
 * own animation ends or `ms` passes, whichever is first. What the pointer or the keys were on is marked `data-active`
 * in the copy, since a copy is neither hovered nor focused.
 *
 * React's strict development pass unmounts and remounts with the element still in the page; then nothing closed and no
 * copy is made.
 */
export function useClosingCopy(element: RefObject<HTMLElement | null>, { enabled, ms }: Readonly<ClosingCopyOptions>) {
  /* Read when it closes, not when it opened, so a motion switch flipped while open still counts. */
  const leave = useEffectEvent((node: HTMLElement) => enabled && leaveCopy(node, ms));
  useLayoutEffect(() => {
    const node = element.current;
    return () => {
      if (node) {
        leave(node);
      }
    };
  }, [element]);
}

type ClosingCopyOptions = { enabled: boolean; ms: number };

/* What names or reaches the original goes from the copy, so nothing finds the closed thing in it. */
const NAMING = ['role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'tabindex'];

function makeLifeless(copy: HTMLElement) {
  for (const entry of [copy, ...copy.querySelectorAll('*')]) {
    NAMING.forEach((name) => entry.removeAttribute(name));
    /* Retire native tab stops as well as inheriting inert from the copy. */
    if ((entry instanceof HTMLElement || entry instanceof SVGElement) && entry.tabIndex >= 0) {
      entry.tabIndex = -1;
    }
    /* An id inside artwork stays: its gradients, patterns and masks find their defs by it, and the original that shared it is gone. */
    if (!entry.closest('svg')) {
      entry.removeAttribute('id');
    }
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.dataset.closing = '';
}

/* Read while the element is still in the page: once React takes it out, nothing is hovered and nothing is scrolled. */
function stateOf(node: HTMLElement) {
  return {
    parent: node.parentNode,
    next: node.nextSibling,
    active: [...node.querySelectorAll(':hover, :focus-visible')],
    scroll: { top: node.scrollTop, left: node.scrollLeft },
  };
}

function leaveCopy(node: HTMLElement, ms: number) {
  const { parent, next, active, scroll } = stateOf(node);
  queueMicrotask(() => {
    if (node.isConnected || !parent?.isConnected) {
      return;
    }
    active.forEach((entry) => entry.setAttribute('data-active', ''));
    const copy = node.cloneNode(true) as HTMLElement;
    makeLifeless(copy);
    const remove = () => copy.remove();
    copy.addEventListener('animationend', (event) => event.target === copy && remove());
    setTimeout(remove, ms);
    parent.insertBefore(copy, next?.parentNode === parent ? next : null);
    copy.scrollTop = scroll.top;
    copy.scrollLeft = scroll.left;
  });
}
