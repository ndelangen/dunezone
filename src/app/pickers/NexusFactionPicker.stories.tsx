import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { Surface } from '@ui/surface/Surface';
import { expect, fn, within } from 'storybook/test';

import { db } from '@db/storybook';

import { withFactionVariants } from './factionVariants.stories.fixture';
import { NexusFactionPicker } from './NexusFactionPicker';

const meta = preview.meta({
  component: NexusFactionPicker,
  parameters: { layout: 'padded', database: db(withFactionVariants) },
  args: { onPick: fn() },
  /* The pane the picker opens in: an editor chapter's width beside the proof, the screen's width on a phone. */
  decorators: [
    (Story) => (
      <Box maw={480}>
        <Surface padding="sm">{Story()}</Surface>
      </Box>
    ),
  ],
});

/** One row per Faction: its token, name and maintainers, with the variant count at the row's end only where there are several. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const atreides = await canvas.findByRole('option', { name: /House Atreides/ });
    await expect(within(atreides).getByRole('img', { name: '3 variants' })).toBeVisible();
    await expect(within(canvas.getByRole('option', { name: /Fremen/ })).queryByRole('img')).toBeNull();
  },
});
