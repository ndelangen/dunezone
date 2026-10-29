import preview from '@sb/preview';

import { homeworlds, satelliteBoard, turntable, twinBoards } from './layouts';
import { MultiBoardTable } from './MultiBoardTable';

/*
 * Exploration (Norbert, 2026-10-29): one game, several boards. Four table layouts, each with its own answer to where the
 * boards come from, which one is primary, how the camera moves between them and how a piece crosses from one to another.
 */
const meta = preview.meta({
  title: 'Play/Explorations/Multiple boards',
  component: MultiBoardTable,
  globals: { motion: 'on' },
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
});

/** A: the sketch. Two full boards side by side, the tanks shared beneath both, the turn track over the right board. */
export const TwinBoards = meta.story({ args: { layout: twinBoards } });

/** B: today's board in the middle, a smaller board docked top right, joined by numbered gates. */
export const SatelliteBoard = meta.story({ args: { layout: satelliteBoard } });

/** C: one board on the table at a time; the other waits in a small disc you can switch to or send pieces to. */
export const Turntable = meta.story({ args: { layout: turntable } });

/** D: the primary board in the middle with four small boards in the table's corners. */
export const Homeworlds = meta.story({ args: { layout: homeworlds } });
