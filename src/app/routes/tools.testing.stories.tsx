import { testingPreview } from '@sb/preview';

import { clearStoredGame } from './_tool/tools/spice-deck/spiceDeck.stories.fixture';
import { findTitledPage } from './site.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tools',
  args: { path: '/tools' },
});

/** The spice deck's address before it was built, which the catalogue once linked: it goes on to the tool. */
export const FormerSpiceDeckAddress = meta.story({
  args: { path: '/tools/spice-deck-tracker' },
  beforeEach: clearStoredGame,
  play: async ({ canvasElement }) => {
    await findTitledPage(canvasElement, /^Spice deck$/);
  },
});
