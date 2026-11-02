import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { VIEWER, alliancesSnapshot } from './alliances.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { withTechTokens } from './multiplayer/HeldTechTokens.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Tech tokens',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/*
 * Mid-play, with seats 4 and 5 allied: seat 1 holds two tech tokens, the viewer one and seat 4 one.
 * Each faction holding any gets a row in a block of its own under the alliances: its token, then its gears.
 * Hover a gear for its name and what it does; hold Alt over it to see it larger.
 */
export const HeldUnderTheAlliances = meta.story({
  beforeEach: install(() =>
    productTransport(
      VIEWER,
      withTechTokens(alliancesSnapshot(), {
        'seat-1': ['heighliners', 'spice-production'],
        'seat-2': ['customs'],
        'seat-4': ['tleilaxu-tanks'],
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const strip = await within(doc.body).findByRole('group', { name: 'Tech tokens' }, { timeout: 30_000 });
    await expect(within(strip).getAllByRole('listitem')).toHaveLength(4);
    const alliances = within(doc.body).getByLabelText('Alliances');
    const toolbar = doc.querySelector('.seated-toolbar')!;
    await waitFor(async () => {
      const [box, tools] = [strip.getBoundingClientRect(), toolbar.getBoundingClientRect()];
      await expect(box.top).toBeGreaterThanOrEqual(alliances.getBoundingClientRect().bottom);
      await expect(box.right <= tools.left || box.top >= tools.bottom, 'The tech tokens run under the toolbar.').toBe(
        true
      );
    });
  },
});
