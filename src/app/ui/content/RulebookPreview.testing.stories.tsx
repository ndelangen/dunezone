import { Box, Button, Stack } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';

import { RulebookPreview } from './RulebookPreview';
import { imageUrl } from './RulebookPreview.stories.fixture';

const meta = testingPreview.meta({
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
const brokenImageUrl = 'data:image/png;base64,not-an-image';

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
    await canvas.findByRole('img', { name: 'First page of Movement: preview unavailable' });
    await userEvent.click(canvas.getByRole('button', { name: 'Use new Edition image' }));
    const image = await canvas.findByRole('img', { name: 'First page of Movement' });
    await waitFor(() => expect((image as HTMLImageElement).naturalWidth).toBeGreaterThan(0));
  },
});
