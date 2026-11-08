import { createContext, use, useLayoutEffect } from 'react';

/** What the table's opening waits on besides its first frames: a part that must be drawn before the frame lifts takes a hold. */
export type SceneHolds = Readonly<{ hold: () => () => void }>;

export const SceneHoldsContext = createContext<SceneHolds | null>(null);

/**
 * Keeps the table's opening waiting while `waiting` is true, so the frame lifts onto that part already drawn, not before it.
 * Taken in a layout effect, so the hold is in before the renderer's next frame can count towards the opening.
 */
export function useSceneHold(waiting: boolean) {
  const holds = use(SceneHoldsContext);
  useLayoutEffect(() => (waiting && holds ? holds.hold() : undefined), [waiting, holds]);
}
