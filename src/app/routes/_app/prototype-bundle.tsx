/**
 * PROTOTYPE — what a bundle looks like, wayfinder ticket #538. THROWAWAY.
 *
 * A bundle is the first Asset type with no visual identifying feature of its own. A treachery card's face comes from
 * its own `data`; a deck looks like a deck because its author made a Cardback. A bundle's row carries a name and
 * nothing else, and its membership lives in `asset_relations`.
 *
 * Norbert ruled out showing all contents and asked for "some sort of container, with a few peeking out". These are the
 * three variants that phrase admits, each at the three sizes the same picture has to survive: a landing pile, a browse
 * tile, and the detail-page hero.
 *
 * Members are drawn with the real `AssetFace` and real stored token data, and the peeking geometry is lifted from
 * `TokenStack` on the landing page rather than invented, so what is being judged here is the container and nothing
 * else.
 */
import { Group, Stack, Text, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import type { CSSProperties, ReactNode } from 'react';

import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import { backgroundPresets } from '@game/data/backgrounds';

export const Route = createFileRoute('/_app/prototype-bundle')({
  component: BundleLookPrototype,
});

/* Real stored token shapes, copied from dev rows so the members are the genuine renderer output. */
const face = (image: string, colors: [string, string], texture: string) => ({
  image,
  background: { image: texture, colors, influence: 0.5, invert: true, definition: 0 },
  symbolScale: 1,
  top: '',
  bottomFirst: '',
  bottomSecond: '',
  ring: true,
});

const MEMBERS = [
  {
    id: 'a',
    type: 'token-round',
    name: 'Shield Generator',
    data: {
      name: 'Shield Generator',
      about: '',
      front: face('/vector/icon/projectile.svg', ['#4B4C0D', '#262B04'], '/image/texture/015.jpg'),
      back: {
        mode: 'custom',
        face: face('/vector/icon/projectile.svg', ['#4B4C0D', '#262B04'], '/image/texture/015.jpg'),
      },
    },
  },
  {
    id: 'b',
    type: 'token-gear',
    name: 'Ornithopter',
    data: {
      name: 'Ornithopter',
      about: '',
      front: face('/vector/icon/wind.svg', ['#8F2C1C', '#621D1A'], '/image/texture/082.jpg'),
      back: { mode: 'custom', face: face('/vector/icon/wind.svg', ['#8F2C1C', '#621D1A'], '/image/texture/082.jpg') },
    },
  },
  {
    id: 'c',
    type: 'token-square',
    name: 'Stronghold',
    data: {
      name: 'Stronghold',
      about: '',
      front: face('/vector/icon/shield.svg', ['#3A4491', '#101D65'], '/image/texture/020.jpg'),
      back: { mode: 'custom', face: face('/vector/icon/shield.svg', ['#3A4491', '#101D65'], '/image/texture/020.jpg') },
    },
  },
];

/* The three sizes the same picture has to survive. */
const SIZES = [
  { key: 'pile', label: 'Landing pile', width: 96 },
  { key: 'tile', label: 'Browse tile', width: 140 },
  { key: 'hero', label: 'Detail hero', width: 352 },
];

/* Lifted from `TokenStack`: the peeking members are the landing page's stacking idiom, not a second one. */
const PEEK = [
  { left: -0.26, rot: -7 },
  { left: 0.0, rot: 3 },
  { left: 0.26, rot: 8 },
];

/**
 * The members, rising from behind the container's front edge.
 * They sit at 44% of the container width so three read as "a few" rather than as a crowd.
 */
function Peeking({ width, members }: { width: number; members: typeof MEMBERS }) {
  const memberWidth = width * 0.44;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'start center' }}>
      {members.slice(0, 3).map((member, index) => {
        const placement = PEEK[index] ?? PEEK[1]!;
        return (
          <div
            key={member.id}
            style={{
              gridArea: '1 / 1',
              transform: `translate(${placement.left * width}px, ${-memberWidth * 0.42}px) rotate(${placement.rot}deg)`,
            }}
          >
            <AssetFace type={member.type} data={member.data} name={member.name} width={memberWidth} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The container front.
 * `band` is what a variant swaps: a flat product-defined strip, or an authored Background the way a Cardback is
 * authored.
 */
function Crate({ width, name, band }: { width: number; name: string; band: ReactNode }) {
  const height = width * 0.62;
  const bandHeight = Math.max(14, height * 0.34);
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: Math.max(4, width / 22),
        overflow: 'hidden',
        zIndex: 1,
        background: 'linear-gradient(#c8b285, #9d8459)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
        border: '1px solid rgba(60,44,20,0.55)',
      }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: (height - bandHeight) / 2, height: bandHeight }}>
        {band}
      </div>
      <Text
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: Math.max(7, width / 13),
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#f4ead2',
          textShadow: '0 1px 2px rgba(0,0,0,0.7)',
          padding: '0 8%',
          textAlign: 'center',
          lineHeight: 1.1,
        }}
      >
        {name}
      </Text>
    </div>
  );
}

const flatBand: CSSProperties = { width: '100%', height: '100%', background: 'linear-gradient(#4a3c22, #2b2211)' };

function GenericBand() {
  return <div style={flatBand} />;
}

function AuthoredBand({ preset }: { preset: keyof typeof backgroundPresets }) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <BackgroundRenderer background={backgroundPresets[preset]} className="" />
    </div>
  );
}

/** One bundle at one size, in one variant. */
function BundleFace({
  width,
  name,
  members,
  band,
}: {
  width: number;
  name: string;
  members: typeof MEMBERS;
  band: ReactNode;
}) {
  const height = width * 0.62;
  /*
   * A member is 44% of the container width and rises 42% of its own width above the crate's top edge, so the block
   * reserves exactly that much headroom. Pinning the peeking layer to the crate's own box rather than the block's
   * keeps the two aligned when the headroom changes.
   */
  const memberWidth = width * 0.44;
  const headroom = members.length > 0 ? memberWidth * 0.42 : 0;
  return (
    <div style={{ position: 'relative', width, height: height + headroom }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
        {members.length > 0 ? <Peeking width={width} members={members} /> : null}
        <Crate width={width} name={name} band={band} />
      </div>
    </div>
  );
}

function VariantBlock({
  title,
  note,
  render,
}: {
  title: string;
  note: string;
  render: (width: number, name: string, members: typeof MEMBERS) => ReactNode;
}) {
  return (
    <Surface padding="lg">
      <Stack gap="lg">
        <div>
          <Title order={3}>{title}</Title>
          <Text size="sm" c="dimmed">
            {note}
          </Text>
        </div>
        {SIZES.map((size) => (
          <Stack key={size.key} gap="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {size.label} · {size.width}px
            </Text>
            <Group align="flex-end" gap="xl" wrap="wrap">
              <Stack gap={4} align="center">
                {render(size.width, 'Tech Tokens', MEMBERS)}
                <Text size="xs" c="dimmed">
                  three members
                </Text>
              </Stack>
              <Stack gap={4} align="center">
                {render(size.width, 'Spice Blow', MEMBERS.slice(0, 2))}
                <Text size="xs" c="dimmed">
                  two members
                </Text>
              </Stack>
              <Stack gap={4} align="center">
                {render(size.width, 'Empty Bundle', [])}
                <Text size="xs" c="dimmed">
                  empty
                </Text>
              </Stack>
            </Group>
          </Stack>
        ))}
      </Stack>
    </Surface>
  );
}

function BundleLookPrototype() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack align="center" gap="xs">
          <Title order={1}>What a bundle looks like</Title>
          <Text c="dimmed">Prototype for wayfinder #538. Throwaway.</Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          <VariantBlock
            title="1. Generic container, nothing peeking"
            note="Every bundle wears the same box. Costs nothing to draw and needs no extra reads, but two bundles differ only by their name."
            render={(width, name) => <BundleFace width={width} name={name} members={[]} band={<GenericBand />} />}
          />
          <VariantBlock
            title="2. Generic container, members peeking"
            note="The same box, with up to three real members above the front edge. Distinguishable at a glance, but the landing and browse pages now need each bundle's member faces, so the bulk read must return type and data rather than id and name."
            render={(width, name, members) => (
              <BundleFace width={width} name={name} members={members} band={<GenericBand />} />
            )}
          />
          <VariantBlock
            title="3. Authored container, members peeking"
            note="The band is authored the way a Cardback is, so a bundle has an identity of its own rather than wearing the house box. Costs a schema field, an editor chapter, and probably a stock set. Shown here with two different bands so the difference can actually be judged."
            render={(width, name, members) => (
              <BundleFace
                width={width}
                name={name}
                members={members}
                band={<AuthoredBand preset={name === 'Tech Tokens' ? 'special' : 'weapon'} />}
              />
            )}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
