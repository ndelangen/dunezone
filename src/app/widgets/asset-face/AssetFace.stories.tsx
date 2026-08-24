import { Box, Group, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';

import { backgroundPresets } from '@game/data/backgrounds';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import { AssetFace } from './AssetFace';

/*
 * Listing rows, which is what `AssetFace` reads.
 * Written out here rather than pulled from the editors' stock tables, because a story fixture is the
 * one place a shape may be stated by hand: these stand in for stored `data`, which arrives untyped.
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

const MEMBERS = [
  { id: 'a', type: 'token-disc', name: 'Spice', data: DISC },
  { id: 'b', type: 'token-enhance', name: 'Lasgun array', data: ENHANCE },
  { id: 'c', type: 'token-plate', name: 'Shield', data: DISC },
];

const meta = preview.meta({
  component: AssetFace,
  parameters: { layout: 'padded' },
  args: { type: 'card-treachery', data: TREACHERY, name: 'Lasgun' },
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

/** A face given the whole canvas takes the whole canvas, because that is the box it was put in. */
export const Card = meta.story({});

export const Deck = meta.story({ args: { type: 'deck', data: CARDBACK, name: 'Treachery deck' } });

export const DiscToken = meta.story({ args: { type: 'token-disc', data: DISC, name: 'Spice' } });

export const EnhanceToken = meta.story({
  args: { type: 'token-enhance', data: ENHANCE, name: 'Lasgun array' },
});

export const Bundle = meta.story({ args: { type: 'bundle', data: BUNDLE, name: 'Weapons' } });

/**
 * A container's members stand above it, so the block is taller than the container by exactly the headroom the tilted row needs.
 * The corner of the most-tilted member is the thing to look at: it is what gets clipped when that headroom is wrong.
 */
export const BundleWithMembers = meta.story({
  args: { type: 'bundle', data: BUNDLE, name: 'Weapons', members: MEMBERS },
});

/** Data that will not read, and an unknown type, both draw the neutral face rather than crashing a page. */
export const Unreadable = meta.story({
  args: { type: 'card-treachery', data: { nothing: 'usable' }, name: 'Missing Artwork' },
});

/**
 * The property every caller now relies on: one face, four parents, no size passed to any of them.
 * The face reads its width from the box it is in and its height from its own ratio, so the only thing that changes down the row is the number on the parent.
 */
export const AtAnyWidth = meta.story({ render: acrossWidths });

/**
 * The same run for a container, whose block is the one face taller than its own frame.
 * The headroom above the container has to grow with the width exactly as the members do, or the most-tilted corner is cut at one size and floats at another.
 */
export const BundleAtAnyWidth = meta.story({
  args: { type: 'bundle', data: BUNDLE, name: 'Weapons', members: MEMBERS },
  render: acrossWidths,
});
