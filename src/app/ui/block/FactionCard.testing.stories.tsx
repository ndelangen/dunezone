import { Button } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { FactionCard } from './FactionCard';
import { baseFaction, publishedImage, failedImage, withImages, missingToken } from './FactionCard.stories.fixture';

const meta = testingPreview.meta({
  component: FactionCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '19rem' }}>
        <Story />
      </div>
    ),
  ],
  args: { faction: baseFaction },
});

function ReplacementPublication() {
  const [image, setImage] = useState(failedImage);
  return (
    <>
      <FactionCard faction={withImages(image)} />
      <Button onClick={() => setImage(publishedImage)}>Use new publication</Button>
    </>
  );
}

export const PublicationAfterFailure = meta.story({
  render: () => <ReplacementPublication />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('img', missingToken);
    await userEvent.click(canvas.getByRole('button', { name: 'Use new publication' }));
    await waitFor(async () => {
      const images = canvasElement.querySelectorAll('img');
      await expect(images).toHaveLength(5);
      await expect([...images].every((image) => image.naturalWidth === 600)).toBe(true);
    });
  },
});
