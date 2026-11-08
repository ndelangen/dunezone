import { createContext, use } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

/*
 * Whether a table plays its arrival: the moons circling the waiting frame and the table opening out of the planet.
 * The product always plays it. Storybook's preview provides `false` for every story that is not about the arrival, because
 * each story mounts its page afresh and would otherwise replay the whole opening before showing the state it is about.
 */
export const TableArrivalContext = createContext(true);

/** Whether the table's arrival moves: motion is allowed and the arrival plays. Otherwise the table shows at once and its waiting frame stays still. */
export function useTableArrivalMotion() {
  const motion = useMotionAllowed();
  return use(TableArrivalContext) && motion;
}
