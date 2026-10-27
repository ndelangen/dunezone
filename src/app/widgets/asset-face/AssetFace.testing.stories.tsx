import { Box, Button, Stack } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { backgroundPresets } from '@game/data/backgrounds';

import { AssetFace } from './AssetFace';
import { TREACHERY, BUNDLE, publishedImage, MEMBERS } from './AssetFace.stories.fixture';

const meta = testingPreview.meta({
  component: AssetFace,
  parameters: { layout: 'padded' },
  args: { type: 'card-treachery', data: TREACHERY, name: 'Lasgun', href: publishedImage },
});

const CARDBACK = {
  cardback: {
    mode: 'custom' as const,
    name: 'Treachery',
    background: backgroundPresets.weapon,
    image: '/vector/icon/projectile.svg',
    imageScale: 0.55,
    imageOffset: [0, 10],
  },
};
const failedImage = 'data:image/jpeg;base64,broken';

function ReplacementPublication() {
  const [href, setHref] = useState(failedImage);
  return (
    <Stack>
      <Box w={220}>
        <AssetFace type="deck" data={CARDBACK} name="Treachery" href={href} />
      </Box>
      <Button onClick={() => setHref(publishedImage)}>Use new publication</Button>
    </Stack>
  );
}

export const PublicationAfterFailure = meta.story({
  render: () => <ReplacementPublication />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    /* A publication that fails to load draws the missing state, with no image or artwork pattern behind it. */
    await expect(canvas.findByRole('img', { name: 'Treachery: preview unavailable' })).resolves.toBeVisible();
    await expect(canvasElement.querySelectorAll('img, svg pattern')).toHaveLength(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Use new publication' }));
    await waitFor(() => expect(canvasElement.querySelector('img')?.naturalWidth).toBe(900));
    await expect(canvasElement.querySelectorAll('svg pattern')).toHaveLength(0);
  },
});

/**
 * A container's members stand above it, so the block is taller than the container by exactly the headroom the tilted row needs.
 * The corner of the most-tilted member is the thing to look at: it is what gets clipped when that headroom is wrong.
 * Each member draws its own publication, and the band is the one live drawing left.
 */
export const BundleWithMembers = meta.story({
  args: { type: 'bundle', data: BUNDLE, name: 'Weapons', href: null, members: MEMBERS },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('img')).toHaveLength(3));
    await expect(canvasElement.querySelectorAll('svg pattern')).toHaveLength(1);
  },
});

/** A band that will not read draws the missing state at the container's ratio rather than crashing a page. */
export const UnreadableBundle = meta.story({
  args: { type: 'bundle', data: { nothing: 'usable' }, name: 'Missing Band', href: null },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole('img', { name: 'Missing Band: preview unavailable' })
    ).resolves.toBeVisible();
  },
});
