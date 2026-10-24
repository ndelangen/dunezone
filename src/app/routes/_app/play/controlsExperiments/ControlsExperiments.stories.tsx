import preview from '@sb/preview';
import type { Decorator } from '@storybook/tanstack-react';

import { gameMeta, install } from '../game.stories.fixture';
import { productTransport } from '../product.stories.fixture';
import { setTableLayout } from '../tableLayout';
import { ControlsExperimentContext } from './experiment';
import type { ControlsExperiment } from './experiment';

/*
 * Design exploration (Norbert, 2026-10-24): a tester found the controls cover too much of the screen in both layouts.
 * Each story is one way to lay them out, on the same seated game; the first two are today's layouts to compare against.
 */
const withExperiment: Decorator = (Story, { parameters }) => (
  <ControlsExperimentContext value={(parameters.controlsExperiment as ControlsExperiment | undefined) ?? null}>
    <Story />
  </ControlsExperimentContext>
);

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Explorations/Controls layout',
  globals: { motion: 'on' },
  decorators: [...gameMeta.decorators, withExperiment],
  beforeEach: install(() => productTransport('seat-2')),
  loaders: [
    async () => {
      await import('../multiplayer/HostedTable');
    },
  ],
});

const experiment = (controlsExperiment: ControlsExperiment) => ({
  parameters: { controlsExperiment, chromatic: { disableSnapshot: true } },
  tags: ['!test'],
});

/** Today: the table above the dock. */
export const TodayClassic = meta.story({ parameters: { chromatic: { disableSnapshot: true } }, tags: ['!test'] });

/** Today: the controls, the table and the players side by side. */
export const TodayThreeColumns = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  beforeEach: () => {
    setTableLayout('columns');
    return () => setTableLayout('stacked');
  },
});

/** A. The tester's idea: the controls float bottom left and the players bottom right; drag the inner top corner to resize, the chevron tucks one away. */
export const A_TwoFloatingPanels = meta.story(experiment('floating-pair'));

/** B. Dock anywhere: every group is a window. Drag a title to the left, right or bottom edge to dock it, or drop it anywhere to float. */
export const B_DockAnywhere = meta.story(experiment('docking'));

/** C. Command palette: only the table on screen. Press / (or ⌘K) to find any control or command; it opens as one sheet. */
export const C_CommandPalette = meta.story(experiment('palette'));

/** D. Pie menu, as in the original Sims: hold Space over the table, point at a group, then at its tab, and let go. */
export const D_PieMenu = meta.story(experiment('pie'));

/** E. Edge drawers: two thin icon rails on the screen's sides; each icon slides its drawer out over the table. */
export const E_EdgeDrawers = meta.story(experiment('drawers'));

/** F. A hand of cards: every control is a card fanned along the bottom edge; pick one up to use it. */
export const F_HandOfCards = meta.story(experiment('fan'));

/** G. Flip: the table owns the whole screen, or the controls do with the live table shrunk to a corner. ` flips. */
export const G_Flip = meta.story(experiment('swap'));
