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

/** Where a layout shows a held node. */
export function HeldSlot({ node }: Readonly<{ node: HeldNode }>) {
  const attach = useCallback(
    (slot: HTMLDivElement | null) => {
      if (!slot) {
        return;
      }
      slot.append(node);
      return () => {
        if (node.parentNode === slot) {
          node.remove();
        }
      };
    },
    [node]
  );
  return <div ref={attach} className="seated-held" />;
}
