import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Where a window's content may lift a piece over the window's top edge: set by a frame whose window asks for it. */
export const WindowHeroContext = createContext<HTMLElement | null>(null);

/**
 * Lifts its children out of the window's scrolling body to stand over the frame's top edge, so they stay in view and take no room.
 * Outside a frame that offers the place, the children render where they are.
 */
export function WindowHero({ children }: Readonly<{ children: ReactNode }>) {
  const slot = useContext(WindowHeroContext);
  return slot ? createPortal(children, slot) : children;
}
