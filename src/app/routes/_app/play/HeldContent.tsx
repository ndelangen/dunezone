import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/*
 * Content that stays mounted while the table's layout moves it: the scene, the controls and the players
 * render once into a node of their own, and whichever layout is shown takes that node into its slot.
 * So switching layouts, or a window crossing the columns' width, keeps the table's renderer, a half-typed
 * message and the open tabs. Both the node and the slot lay out as `display: contents`, so the content sits
 * in the slot's parent exactly as it would as its child.
 */
export type HeldNode = HTMLDivElement;

export function useHeldNode(): HeldNode {
  const [node] = useState(() => {
    const element = document.createElement('div');
    element.className = 'seated-held';
    return element;
  });
  return node;
}

/** Renders the content into its held node, wherever the node is shown. */
export function Held({ node, children }: Readonly<{ node: HeldNode; children: ReactNode }>) {
  return createPortal(children, node);
}

type HeldFocus = Readonly<{
  element: HTMLElement;
  start: number | null;
  end: number | null;
  direction: 'forward' | 'backward' | 'none' | undefined;
}>;
type HeldScroll = Readonly<{ element: Element; top: number; left: number }>;

/*
 * Moving a node out of the document drops the focus inside it and resets every scroll offset in it;
 * the slot it lands in hands both back, with the caret where it was.
 */
const heldFocus = new WeakMap<HeldNode, HeldFocus>();
const heldScrolls = new WeakMap<HeldNode, readonly HeldScroll[]>();

function isTextField(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function selectionOf(element: Element) {
  return isTextField(element)
    ? { start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection ?? undefined }
    : { start: null, end: null, direction: undefined };
}

function rememberScrolls(node: HeldNode) {
  const scrolled = [...node.querySelectorAll('*')].filter((element) => element.scrollTop || element.scrollLeft);
  heldScrolls.set(
    node,
    scrolled.map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }))
  );
}

function restoreScrolls(node: HeldNode) {
  for (const { element, top, left } of heldScrolls.get(node) ?? []) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  heldScrolls.delete(node);
}

function rememberFocus(node: HeldNode) {
  const active = node.ownerDocument.activeElement;
  if (active instanceof HTMLElement && node.contains(active)) {
    heldFocus.set(node, { element: active, ...selectionOf(active) });
  }
}

/*
 * Focus goes back only to what the node still holds, and only when the move took it away and nothing else took it meanwhile;
 * a node `moveBefore` moved kept its focus, and refocusing it would fire focus handlers for a move nobody made.
 * The caret goes back either way, since a moved text field can lose its selection.
 */
function restoreFocus(node: HeldNode) {
  const held = heldFocus.get(node);
  heldFocus.delete(node);
  if (!held || !node.contains(held.element)) {
    return;
  }
  const { element, start, end, direction } = held;
  const document = node.ownerDocument;
  if (document.activeElement === document.body) {
    element.focus({ preventScroll: true });
  }
  if (start !== null && document.activeElement === element && isTextField(element)) {
    element.setSelectionRange(start, end, direction);
  }
}

/*
 * Where a browser can move a node without taking it out of the document (`moveBefore`), nothing inside it notices the move:
 * no blur, no focus, no scroll reset. Between a deleted slot and the next one the node waits in the body for the rest of the commit;
 * a node no slot takes by then (the table closed) leaves the body too.
 */
function parkNode(node: HeldNode) {
  if (!node.isConnected) {
    node.remove();
    return;
  }
  const body = node.ownerDocument.body;
  body.moveBefore(node, null);
  queueMicrotask(() => {
    if (node.parentNode === body) {
      node.remove();
    }
  });
}

const canMoveNodes = typeof Element !== 'undefined' && 'moveBefore' in Element.prototype;

/*
 * Where a layout shows a held node.
 * This relies on React's commit order: a deleted slot's ref cleanup runs, with its node still in the document, before the new slot's ref attaches it;
 * and a `Held` renders before the layout, so the content exists by the time any slot shows it.
 */
export function HeldSlot({ node }: Readonly<{ node: HeldNode }>) {
  const attach = useCallback(
    (slot: HTMLDivElement | null) => {
      if (!slot) {
        return;
      }
      if (canMoveNodes && node.isConnected) {
        slot.moveBefore(node, null);
      } else {
        slot.append(node);
      }
      restoreScrolls(node);
      restoreFocus(node);
      return () => {
        if (node.parentNode !== slot) {
          return;
        }
        rememberScrolls(node);
        rememberFocus(node);
        if (canMoveNodes) {
          parkNode(node);
        } else {
          node.remove();
        }
      };
    },
    [node]
  );
  return <div ref={attach} className="seated-held" />;
}
