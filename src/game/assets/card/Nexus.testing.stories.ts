import { testingPreview } from '@sb/preview';
import { GF9_NEXUS_CARDS } from '@shared/assets/gf9Nexus';
import { expect, within } from 'storybook/test';

import { NexusCard } from './Nexus';

const { about: _about, ...face } = GF9_NEXUS_CARDS[0]!;

const meta = testingPreview.meta({
  title: 'Nexus',
  component: NexusCard,
  globals: { viewport: { value: 'card' } },
  args: face,
});
/** The one faction named in the singular, so its Secret Ally condition reads "is" rather than "are". */
export const Emperor = meta.story({
  args: GF9_NEXUS_CARDS.find(({ faction }) => faction === 'Emperor')!,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/If the Emperor is not in the game/)).toBeVisible();
  },
});
