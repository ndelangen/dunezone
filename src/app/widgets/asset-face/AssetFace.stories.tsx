import { Box, Group, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { heldImage, serveStoryImages } from '@sb/storyImages';
import { expect, waitFor, within } from 'storybook/test';

import { AssetFace, assetFaceAspect } from './AssetFace';
import { TREACHERY, DISC, BUNDLE, publishedImage, MEMBERS } from './AssetFace.stories.fixture';

const meta = preview.meta({
  component: AssetFace,
  parameters: { layout: 'padded' },
  args: { type: 'card-treachery', data: TREACHERY, name: 'Lasgun', href: publishedImage },
});

/** Waits until every published face in the story has decoded at the renderers' 900px width. */
async function expectFacesLoaded(canvasElement: HTMLElement, count: number) {
  await waitFor(async () => {
    const images = canvasElement.querySelectorAll('img');
    await expect(images).toHaveLength(count);
    await expect([...images].every((image) => image.naturalWidth === 900)).toBe(true);
  });
}

/** Four real widths from the app: a picker row, a landing pile, a browse tile, and the detail page's hero. */
const WIDTHS = [44, 96, 220, 340];

function acrossWidths(args: Parameters<typeof AssetFace>[0]) {
  return (
    <Group align="flex-start" gap="xl">
      {WIDTHS.map((width) => (
        <Stack key={width} gap={6} align="center">
          <Box w={width}>
            <AssetFace {...args} />
          </Box>
          <Text size="xs" c="dimmed">{`${width}px parent`}</Text>
        </Stack>
      ))}
    </Group>
  );
}

/**
 * The property every caller relies on: one face, four parents, no size passed to any of them.
 * The face reads its width from the box it is in and its height from its own ratio, so the only thing that changes down the row is the number on the parent.
 */
export const PublishedCard = meta.story({
  render: acrossWidths,
  play: async ({ canvasElement }) => {
    await expectFacesLoaded(canvasElement, WIDTHS.length);
    await expect(canvasElement.querySelectorAll('svg pattern')).toHaveLength(0);
  },
});

export const MissingPublication = meta.story({
  args: { href: null, name: 'Missing Artwork' },
  render: acrossWidths,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('img', { name: 'Missing Artwork: preview unavailable' })
    ).toHaveLength(4);
    await expect(canvasElement.querySelectorAll('img, svg pattern')).toHaveLength(0);
  },
});

/** A publication still on its way draws a clear slot and no words, so loading never reads as missing. */
export const LoadingPublication = meta.story({
  args: { href: heldImage('asset-face') },
  loaders: [serveStoryImages],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.queryByText(/\S/)).toBeNull();
      await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
    await expect(canvas.queryByRole('img', { name: /preview unavailable/ })).toBeNull();
  },
});

const TOKEN_TYPES = ['token-disc', 'token-tech', 'token-plate', 'token-pointer', 'token-enhance'];

/** Each token type's face keeps its own shape's ratio, so its height over its width is that shape's aspect. */
export const PublishedTokenShapes = meta.story({
  render: () => (
    <Group align="start">
      {TOKEN_TYPES.map((type) => (
        <Box key={type} w={96}>
          <AssetFace type={type} data={DISC} name={type} href={publishedImage} />
        </Box>
      ))}
    </Group>
  ),
  play: async ({ canvasElement }) => {
    await expectFacesLoaded(canvasElement, TOKEN_TYPES.length);
    const canvas = within(canvasElement);
    for (const type of TOKEN_TYPES) {
      const face = canvas.getByRole('img', { name: type }).closest('[data-phase]');
      const box = face?.getBoundingClientRect();
      await expect(box && box.height / box.width).toBeCloseTo(assetFaceAspect(type), 1);
    }
  },
});

/** A bundle publishes nothing, so its row carries no href and its container is drawn from its band. */
export const Bundle = meta.story({ args: { type: 'bundle', data: BUNDLE, name: 'Weapons', href: null } });

/**
 * The same run for a container, whose block is the one face taller than its own frame.
 * The headroom above the container has to grow with the width exactly as the members do, or the most-tilted corner is cut at one size and floats at another.
 */
export const BundleAtAnyWidth = meta.story({
  args: { type: 'bundle', data: BUNDLE, name: 'Weapons', href: null, members: MEMBERS },
  render: acrossWidths,
  play: async ({ canvasElement }) => {
    await expectFacesLoaded(canvasElement, WIDTHS.length * MEMBERS.length);
    const canvas = within(canvasElement);
    for (const width of WIDTHS) {
      /* The parent box is the block's top edge; no tilted member's corner may rise past it. */
      const parent = canvas.getByText(`${width}px parent`).previousElementSibling;
      if (!(parent instanceof HTMLElement)) {
        throw new Error(`No ${width}px parent box`);
      }
      const { top } = parent.getBoundingClientRect();
      for (const member of within(parent).getAllByRole('img')) {
        await expect(member.getBoundingClientRect().top).toBeGreaterThanOrEqual(top - 0.5);
      }
    }
  },
});
