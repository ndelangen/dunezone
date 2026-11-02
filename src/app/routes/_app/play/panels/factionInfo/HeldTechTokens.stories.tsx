import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { HeldTechTokens } from './HeldTechTokens';
import { heldTechTokenPieces } from './HeldTechTokens.stories.fixture';

/*
 * The tech tokens one faction holds, as its Faction info toolbar shows them beside its allies: Dreamrules gears at the allies' size.
 * Each story shows one way a holding reads; the toolbar and panel stories show it in place.
 */
const meta = preview.meta({
  ...panelMeta(PANEL_WINDOWS.factionInfo),
  title: 'Play/Panels/Faction info/Held tech tokens',
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
