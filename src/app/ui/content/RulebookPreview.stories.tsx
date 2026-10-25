import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { RulebookPreview } from './RulebookPreview';
import { imageUrl } from './RulebookPreview.stories.fixture';

const meta = preview.meta({
  component: RulebookPreview,
  args: { name: 'Movement', imageUrl },
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <Box w={144}>
        <Story />
      </Box>
    ),
  ],
});

export const Available = meta.story({
  play: async ({ canvas }) => {
    const image = canvas.getByRole('img', { name: 'First page of Movement' });
    await waitFor(() => expect((image as HTMLImageElement).naturalWidth).toBeGreaterThan(0));
  },
});

/** With no published page and no capture on its way or failed, the preview draws the shared missing state. */
export const Unavailable = meta.story({
  args: { imageUrl: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'First page of Movement: preview unavailable' })).toBeVisible();
  },
});

export const Preparing = meta.story({
  args: { imageUrl: null, status: 'in_progress' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'First-page preview preparing for Movement' })).toBeVisible();
  },
});

export const Square = meta.story({ args: { size: 'square', imageUrl: null } });
export const Tall = meta.story({ args: { size: 'tall', imageUrl: null } });

export const FailedCapture = meta.story({
  args: { imageUrl: null, status: 'failed' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'First-page preview failed for Movement' })).toBeVisible();
  },
});

export const ChooserSize = meta.story({
  decorators: [
    (Story) => (
      <Box w={32}>
        <Story />
      </Box>
    ),
  ],
});
