import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { EmptyNote } from './EmptyNote';

const meta = preview.meta({
  component: EmptyNote,
  parameters: { layout: 'padded' },
  args: { children: 'No factions created yet.' },
});

/** One dimmed line, with no pane around it. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No factions created yet.')).toBeVisible();
  },
});
