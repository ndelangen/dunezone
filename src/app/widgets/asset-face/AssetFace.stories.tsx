import { Box, Button, Group, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { backgroundPresets } from '@game/data/backgrounds';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import { AssetFace } from './AssetFace';
import type { AssetFaceMember } from './AssetFace';

/*
 * Listing rows, which is what a caller hands `AssetFace`.
 * Written out here rather than pulled from the editors' stock tables, because a story fixture is the
 * one place a shape may be stated by hand: these stand in for stored `data`, which arrives untyped.
 * Only `BUNDLE`'s data is drawn, since every other face draws its `href`.
 */
const TREACHERY = { ...treacheryCardFixtures.lasgun, about: '' };

const CARDBACK = {
  cardback: {
    name: 'Treachery',
    background: backgroundPresets.weapon,
    image: '/vector/icon/projectile.svg',
    imageScale: 0.55,
    imageOffset: [0, 10],
  },
};

const DISC = {
  name: 'Spice',
  about: '',
  front: {
    image: '/vector/icon/eye.svg',
    background: backgroundPresets.special,
    symbolScale: 1,
    top: 'SPICE',
    bottomFirst: '',
    bottomSecond: '',
    ring: true,
  },
  back: { mode: 'same' },
};

const ENHANCE = {
  name: 'Lasgun array',
  about: '',
  front: { background: backgroundPresets.weapon, ring: true, decals: [], texts: [] },
  back: { mode: 'same' },
};

const BUNDLE = { band: { background: backgroundPresets.weapon, label: 'Weapons' } };

const publishedImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1263"><rect width="900" height="1263" fill="#474620"/><text x="450" y="630" text-anchor="middle" fill="#eee0bb" font-size="70">Published face</text></svg>')}`;
const failedImage = 'data:image/jpeg;base64,broken';

/* A stored row's id is a branded Convex id, which a fixture can only state by assertion. */
function memberId(id: string) {
  return id as AssetFaceMember['id'];
}

const MEMBERS: AssetFaceMember[] = [
  { id: memberId('a'), type: 'token-disc', name: 'Spice', data: DISC, previewHref: publishedImage },
  { id: memberId('b'), type: 'token-enhance', name: 'Lasgun array', data: ENHANCE, previewHref: publishedImage },
  { id: memberId('c'), type: 'token-plate', name: 'Shield', data: DISC, previewHref: publishedImage },
];

const meta = preview.meta({
  component: AssetFace,
  parameters: { layout: 'padded' },
  args: { type: 'card-treachery', data: TREACHERY, name: 'Lasgun', href: publishedImage },
});

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
    await waitFor(() => {
      const images = canvasElement.querySelectorAll('img');
      expect(images).toHaveLength(WIDTHS.length);
      expect([...images].every((image) => image.naturalWidth === 900)).toBe(true);
    });
    expect(canvasElement.querySelectorAll('svg pattern')).toHaveLength(0);
  },
});

export const MissingPublication = meta.story({
  args: { href: null, name: 'Missing Artwork' },
  render: acrossWidths,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getAllByRole('img', { name: 'Missing Artwork: preview unavailable' })).toHaveLength(4);
    expect(canvasElement.querySelectorAll('img, svg pattern')).toHaveLength(0);
  },
});

export const FailedPublication = meta.story({
  args: { href: failedImage },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole('img', { name: 'Lasgun: preview unavailable' })
    ).resolves.toBeVisible();
    expect(canvasElement.querySelectorAll('img, svg pattern')).toHaveLength(0);
  },
});

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
    await canvas.findByRole('img', { name: 'Treachery: preview unavailable' });
    await userEvent.click(canvas.getByRole('button', { name: 'Use new publication' }));
    await waitFor(() => expect(canvasElement.querySelector('img')?.naturalWidth).toBe(900));
    expect(canvasElement.querySelectorAll('svg pattern')).toHaveLength(0);
  },
});

export const PublishedTokenShapes = meta.story({
  render: () => (
    <Group align="start">
      {['token-disc', 'token-tech', 'token-plate', 'token-enhance'].map((type) => (
        <Box key={type} w={96}>
          <AssetFace type={type} data={DISC} name={type} href={publishedImage} />
        </Box>
      ))}
    </Group>
  ),
});

/** A bundle publishes nothing, so its row carries no href and its container is drawn from its band. */
export const Bundle = meta.story({ args: { type: 'bundle', data: BUNDLE, name: 'Weapons', href: null } });

/**
 * A container's members stand above it, so the block is taller than the container by exactly the headroom the tilted row needs.
 * The corner of the most-tilted member is the thing to look at: it is what gets clipped when that headroom is wrong.
 * Each member draws its own publication, and the band is the one live drawing left.
 */
export const BundleWithMembers = meta.story({
  args: { type: 'bundle', data: BUNDLE, name: 'Weapons', href: null, members: MEMBERS },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('img')).toHaveLength(3));
    expect(canvasElement.querySelectorAll('svg pattern')).toHaveLength(1);
  },
});

/** A band that will not read draws the neutral face at the container's ratio rather than crashing a page. */
export const UnreadableBundle = meta.story({
  args: { type: 'bundle', data: { nothing: 'usable' }, name: 'Missing Band', href: null },
});

/**
 * The same run for a container, whose block is the one face taller than its own frame.
 * The headroom above the container has to grow with the width exactly as the members do, or the most-tilted corner is cut at one size and floats at another.
 */
export const BundleAtAnyWidth = meta.story({
  args: { type: 'bundle', data: BUNDLE, name: 'Weapons', href: null, members: MEMBERS },
  render: acrossWidths,
});
