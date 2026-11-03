import preview from '@sb/preview';
import { DarkSchemeIsland } from '@ui/surface/DarkSchemeIsland';
import { expect } from 'storybook/test';

import { HeldTechTokens } from './HeldTechTokens';
import { heldTechTokenPieces } from './HeldTechTokens.stories.fixture';

/*
 * The tech tokens one faction holds, as the top bar shows them beside the alliances: Dreamrules gears at the faction tokens' size.
 * Each story shows one way a holding reads; Play/Tech tokens shows them in place.
 */
const meta = preview.meta({
  title: 'Play/Tech tokens/Held tech tokens',
  decorators: [
    (Story) => (
      <DarkSchemeIsland>
        <div style={{ padding: 16 }}>
          <Story />
        </div>
      </DarkSchemeIsland>
    ),
  ],
  component: HeldTechTokens,
  args: { tokens: heldTechTokenPieces(['heighliners', 'spice-production', 'customs']) },
});

/** Three tech tokens face up, each named in a list a screen reader reads out. */
export const Holding = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
  },
});

/** A token its holder turned face down shows its back and is named only as a tech token. */
export const FaceDown = meta.story({
  args: { tokens: heldTechTokenPieces(['customs'], { faceDown: ['customs'] }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem', { name: 'Face-down tech token' })).toBeVisible();
  },
});
