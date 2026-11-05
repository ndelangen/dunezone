import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';

import { warnDroppedChild } from './warnDroppedChild';

/** A Layout's slot marker: renders nothing, and exists to be found by identity among the Layout's children. */
type Slot = (props: never) => null;
type SlotProps<S> = S extends (props: infer P) => null ? P : never;

/**
 * The slot walk every kit Layout shares: finds each named slot among the direct children by identity and hands back its props, so a Layout reads `slots.Rail?.children` instead of writing the walk again.
 *
 * Anything that matches no slot goes to `warnDroppedChild`, named as `Layout.Slot`, so a wrapped or stray child is reported the same way in every Layout.
 * A slot given twice keeps its last copy, as each hand-written walk did.
 */
export function collectSlots<const S extends Record<string, Slot>>(
  layout: string,
  slots: S,
  children: ReactNode
): { [K in keyof S]?: SlotProps<S[K]> } {
  const entries = Object.entries(slots) as [keyof S & string, Slot][];
  const names = entries.map(([key]) => `${layout}.${key}`);
  const found: { [K in keyof S]?: SlotProps<S[K]> } = {};
  Children.forEach(children, (child) => {
    const match = isValidElement(child) ? entries.find(([, slot]) => child.type === slot) : undefined;
    if (!match || !isValidElement(child)) {
      warnDroppedChild(layout, names, child);
      return;
    }
    found[match[0]] = child.props as SlotProps<S[(typeof match)[0]]>;
  });
  return found;
}
