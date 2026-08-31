import { Box, Button, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';

import { RulebookPreview } from './RulebookPreview';

/* A synthetic document image exercises image delivery without depending on publication infrastructure. */
const imageUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297" viewBox="0 0 210 297"><rect width="210" height="297" fill="#f4eed7"/><text x="20" y="36" font-family="serif" font-size="18">Movement</text><path d="M20 48h170M20 76h140M20 86h160M20 96h155M20 125h165M20 135h130" stroke="#6d5b3a"/></svg>')}`;
const brokenImageUrl = 'data:image/png;base64,not-an-image';

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

export const Unavailable = meta.story({
  args: { imageUrl: null },
  play: async ({ canvas }) => {
    expect(canvas.getByRole('img', { name: 'First-page preview unavailable for Movement' })).toBeVisible();
  },
});

export const FailedImage = meta.story({
  args: { imageUrl: brokenImageUrl },
  play: async ({ canvas }) => {
    await expect(
      canvas.findByRole('img', { name: 'First-page preview unavailable for Movement' })
    ).resolves.toBeVisible();
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

function ReplacementImage() {
  const [url, setUrl] = useState(brokenImageUrl);
  return (
    <Stack>
      <RulebookPreview name="Movement" imageUrl={url} />
      <Button onClick={() => setUrl(imageUrl)}>Use new Edition image</Button>
    </Stack>
  );
}

export const ReplacementAfterFailure = meta.story({
  render: () => <ReplacementImage />,
  play: async ({ canvas }) => {
    await canvas.findByRole('img', { name: 'First-page preview unavailable for Movement' });
    await userEvent.click(canvas.getByRole('button', { name: 'Use new Edition image' }));
    const image = canvas.getByRole('img', { name: 'First page of Movement' });
    await waitFor(() => expect((image as HTMLImageElement).naturalWidth).toBeGreaterThan(0));
  },
});
