/**
 * Defensive asset-face rendering, wherever an Asset has to be shown rather than named.
 *
 * It left `src/app/routes` the moment something outside the assets routes needed it.
 * A picker row draws the same face as a browse tile, and a file only its own routes may import cannot serve both.
 *
 * Listing `data` arrives untyped — the per-type Zod schemas live with the editors — so each adapter safeParses just enough to hand the real game renderer its props, and anything unrenderable falls back to a neutral face rather than crashing a browse page.
 * The scale frames wrap the renderers' intrinsic sizes (cards draw at 900x1263, tokens fill).
 */
import { Text } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';
import { z } from 'zod';

import { CardBack } from '@game/assets/card/Back';
import { CustomToken } from '@game/assets/token/Custom';
import { RectangleToken } from '@game/assets/token/Rectangle';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { TreacheryAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import { BUNDLE_ASPECT, BundleContainer } from './BundleContainer';
import type { BundleBandData } from './BundleContainer';

export const CARD_ASPECT = CARD_SIZE.height / CARD_SIZE.width;

/** Enough of a container's member to draw its face. The browse read and the detail page's member list both supply this shape. */
export type AssetFaceMember = { id: string; type: string; name: string; data: unknown };

/** A member draws at 44% of the container's width, so three read as "a few" rather than as a crowd. */
const MEMBER_WIDTH_RATIO = 0.44;

/** A member rises this much of its own width above the container's top edge. */
const MEMBER_RISE_RATIO = 0.42;

/**
 * Where each peeking member sits, as a fraction of the container's width, plus its tilt.
 * Lifted from the landing page's `TokenStack`: a few things leaning out of a pile is the app's existing idiom rather than a second one invented here.
 */
const MEMBER_PEEK = [
  { left: -0.26, rotation: -7 },
  { left: 0, rotation: 3 },
  { left: 0.26, rotation: 8 },
];

/** How many members peek. «What a bundle looks like» chose three, and the read that feeds this caps at the same number. */
const PEEKING_LIMIT = MEMBER_PEEK.length;

/**
 * How far a tilted member's corner climbs above its own top edge, as a fraction of the member's width.
 *
 * A member is tilted about its centre, so the rise the layout has to reserve is not the rise the transform states.
 * The browse tile draws inside `CanvasScale`, which clips, and without this the corner of the most-tilted member was cut: 10px off a 352px face, and only on the members whose artwork reaches their own corners, which is why a disc token looked fine beside a clipped enhance token.
 * Read off `MEMBER_PEEK` rather than measured once and written down, so changing a tilt cannot leave a stale number behind.
 * `sin` alone slightly over-reserves, because the true growth is offset by a `cos` term that shrinks with the member's height, and over-reserving shows a few transparent pixels where under-reserving shows a cut corner.
 */
const MEMBER_TILT_RISE = Math.max(
  ...MEMBER_PEEK.map(({ rotation }) => Math.sin(Math.abs(rotation) * (Math.PI / 180)) / 2)
);

/** The height a peeking row adds above a container, as a multiple of the container's width. Nothing peeking costs nothing. */
function bundleHeadroom(memberCount: number): number {
  return memberCount > 0 ? MEMBER_WIDTH_RATIO * (MEMBER_RISE_RATIO + MEMBER_TILT_RISE) : 0;
}

/** An enhance token is wider than it is tall; every other token shape is square. */
const RECTANGLE_TOKEN_ASPECT = 0.62;

/** a cog silhouette for the tech token's frame — 10 teeth, alternating outer/inner radius */
const GEAR_CLIP = (() => {
  const steps = 20;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const next = ((i + 0.72) / steps) * 2 * Math.PI;
    const r = i % 2 === 0 ? 50 : 41;
    points.push(`${50 + r * Math.cos(angle)}% ${50 + r * Math.sin(angle)}%`);
    points.push(`${50 + r * Math.cos(next)}% ${50 + r * Math.sin(next)}%`);
  }
  return `polygon(${points.join(', ')})`;
})();

function CardFrame({ width, children, style }: { width: number; children: ReactNode; style?: CSSProperties }) {
  const scale = width / CARD_SIZE.width;
  return (
    <div
      style={{
        width,
        height: width * CARD_ASPECT,
        position: 'relative',
        borderRadius: width / 18,
        overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: CARD_SIZE.width,
          height: CARD_SIZE.height,
          pointerEvents: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

type TokenShape = 'round' | 'gear' | 'square' | 'rectangle';

export function TokenFrame({
  shape,
  width,
  children,
  style,
}: {
  shape: TokenShape;
  width: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const height = shape === 'rectangle' ? width * RECTANGLE_TOKEN_ASPECT : width;
  const gear = shape === 'gear';
  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        borderRadius: shape === 'round' ? '50%' : gear ? undefined : 8,
        clipPath: gear ? GEAR_CLIP : undefined,
        overflow: 'hidden',
        boxShadow: gear ? undefined : '0 2px 10px rgba(0,0,0,0.45)',
        filter: gear ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' : undefined,
        flexShrink: 0,
        ...style,
      }}
    >
      <div style={{ width, height, pointerEvents: 'none' }}>{children}</div>
    </div>
  );
}

function NeutralFace({ name, width, aspect }: { name: string; width: number; aspect: number }) {
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      style={{
        width,
        height: width * aspect,
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--mantine-color-default)',
        border: '1px solid var(--mantine-color-default-border)',
        flexShrink: 0,
      }}
    >
      <Text fw={700} c="dimmed">
        {initials || '?'}
      </Text>
    </div>
  );
}

/* The editors own the full schemas; listings ask only for what a face render needs. */
/* A bundle draws its authored band and nothing else; its members are the caller's to supply. */
const bundleFaceSchema = z.object({
  band: z.looseObject({ background: z.unknown(), label: z.string() }),
});

const cardbackFaceSchema = z.object({
  cardback: z.looseObject({
    name: z.string(),
    background: z.unknown(),
    image: z.string(),
    imageScale: z.number(),
    imageOffset: z.tuple([z.number(), z.number()]).optional(),
  }),
});

/**
 * One drawable token face.
 * Loose on purpose: the editors own the full schema, and a listing that refused to draw a face over one unexpected key would be worse than one that draws it.
 * The label and scale fields are optional so a token stored before they existed still renders.
 */
const drawableTokenFace = z.looseObject({
  background: z.unknown(),
  image: z.string(),
  symbolScale: z.number().optional(),
  top: z.string().optional(),
  bottomFirst: z.string().optional(),
  bottomSecond: z.string().optional(),
  ring: z.boolean().optional(),
});

const tokenFaceSchema = z.object({
  front: drawableTokenFace,
  /* A referenced back stores no face; the caller resolves it to the other token and draws that token's front. */
  back: z
    .union([
      z.looseObject({ mode: z.literal('custom'), face: drawableTokenFace }),
      z.looseObject({ mode: z.literal('reference') }),
    ])
    .optional(),
});

type DrawableTokenFace = z.infer<typeof drawableTokenFace>;

/**
 * One drawable rectangle face.
 * Loose for the same reason as the round shapes, and the element lists are optional so a face authored before either list existed still draws its background.
 */
const drawableRectangleFace = z.looseObject({
  background: z.unknown(),
  ring: z.boolean().optional(),
  decals: z.array(z.unknown()).optional(),
  texts: z.array(z.unknown()).optional(),
});

const rectangleFaceSchema = z.object({
  front: drawableRectangleFace,
  back: z
    .union([
      z.looseObject({ mode: z.literal('custom'), face: drawableRectangleFace }),
      z.looseObject({ mode: z.literal('reference') }),
    ])
    .optional(),
});

/**
 * Which of a token's two faces to draw.
 * Both token models store their backside identically, so this is one rule rather than one per model.
 * A referenced back returns nothing, since it is another token's front and only the caller holds that token.
 */
function faceForSide<TFace>(
  parsed: { front: TFace; back?: { mode: 'custom'; face: TFace } | { mode: 'reference' } } | undefined,
  side: AssetFaceSide
): TFace | undefined {
  if (!parsed) {
    return undefined;
  }
  if (side === 'back') {
    return parsed.back?.mode === 'custom' ? parsed.back.face : undefined;
  }
  return parsed.front;
}

/**
 * Which face of a token to draw.
 * `back` falls through to the neutral face when the token has no authored back, since a referenced back is another token's front and only the caller holds that token.
 */
export type AssetFaceSide = 'front' | 'back';

/**
 * The height of a type's face as a multiple of its width.
 * One place, because the frames below and every caller that has to reserve space for a face were otherwise deriving the same three numbers separately.
 *
 * `memberCount` matters only for a bundle, whose peeking members stand above the container and make the drawn block taller than the container alone.
 * A caller that passes none gets the container's own ratio, which is what every other type and every memberless bundle draws.
 */
export function assetFaceAspect(type: string, memberCount = 0): number {
  if (type === 'bundle') {
    return BUNDLE_ASPECT + bundleHeadroom(memberCount);
  }
  const shape = tokenShapeOfType(type);
  switch (shape) {
    case null:
      return CARD_ASPECT;
    case 'rectangle':
      return RECTANGLE_TOKEN_ASPECT;
    default:
      return 1;
  }
}

export function tokenShapeOfType(type: string): TokenShape | null {
  switch (type) {
    case 'token-disc':
      return 'round';
    case 'token-tech':
      return 'gear';
    case 'token-plate':
      return 'square';
    case 'token-enhance':
      return 'rectangle';
    default:
      return null;
  }
}

/** The renderer centres the symbol in a 300-unit box, so scale is expressed against its reference size. */
function tokenSymbolSize(face: DrawableTokenFace) {
  const scale = face.symbolScale ?? 1;
  return { width: 100 * scale, height: 100 * scale };
}

/** The renderer takes one `bottom` string split on a newline; the stored shape keeps the two lines apart. */
function tokenBottom(face: DrawableTokenFace): string | undefined {
  const first = face.bottomFirst ?? '';
  const second = face.bottomSecond ?? '';
  return first || second ? `${first}\n${second}` : undefined;
}

/**
 * A container's first few members, rising from behind its front edge.
 *
 * They are the caller's to supply, since only a caller holding those rows has them, which is why `BundleContainer` draws none.
 * The nested `AssetFace` is passed no members of its own, so a member draws its bare face and the recursion stops one level down whatever it holds.
 */
function PeekingMembers({ width, members }: { width: number; members: AssetFaceMember[] }) {
  const memberWidth = width * MEMBER_WIDTH_RATIO;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'start center' }}>
      {members.slice(0, PEEKING_LIMIT).map((member, index) => {
        const placement = MEMBER_PEEK[index] ?? MEMBER_PEEK[1]!;
        return (
          <div
            key={member.id}
            style={{
              gridArea: '1 / 1',
              transform: `translate(${placement.left * width}px, ${-memberWidth * MEMBER_RISE_RATIO}px) rotate(${placement.rotation}deg)`,
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
 * A bundle's block: the container, with its members standing behind it.
 *
 * The block is taller than the container by exactly the headroom the peeking row needs, and `assetFaceAspect` reports that same total from the same function, so a caller reserving space and this drawing it cannot drift apart.
 */
function BundleBlock({ width, members, children }: { width: number; members: AssetFaceMember[]; children: ReactNode }) {
  const height = width * BUNDLE_ASPECT;
  return (
    <div style={{ position: 'relative', width, height: height + width * bundleHeadroom(members.length) }}>
      {/* Pinned to the container's own box rather than the block's, so the two stay aligned whenever the headroom changes. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
        {members.length > 0 ? <PeekingMembers width={width} members={members} /> : null}
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Renders one asset's face at the given width, framed and clipped per its type.
 * Unknown types and unrenderable data come back as the neutral face, never a crash.
 *
 * `side` picks which face of a token to draw and is ignored by every other type.
 * A token whose back is a *reference* draws nothing here: that back is another token's front, and only a caller holding that token's own row can supply it.
 */
export function AssetFace({
  type,
  data,
  name,
  width,
  side = 'front',
  members = [],
}: {
  type: string;
  data: unknown;
  name: string;
  width: number;
  side?: AssetFaceSide;
  /**
   * A container's first few members, drawn peeking above it.
   *
   * Only `bundle` reads this, the way only tokens read `side`.
   * A deck is a container too and ignores it, because a deck wears a Cardback and is recognisable on sight.
   * «What a bundle looks like» gave the peeking members to the one type with no face of its own.
   * Empty draws the container alone, which is also what a bundle nobody has filled draws.
   */
  members?: AssetFaceMember[];
}) {
  if (type === 'card-treachery') {
    const parsed = TreacheryAsset.safeParse(data);
    if (parsed.success) {
      return (
        <CardFrame width={width}>
          <TreacheryCard {...parsed.data} />
        </CardFrame>
      );
    }
    return <NeutralFace name={name} width={width} aspect={CARD_ASPECT} />;
  }

  if (type === 'bundle') {
    const parsed = bundleFaceSchema.safeParse(data);
    return (
      <BundleBlock width={width} members={members}>
        {parsed.success ? (
          /* the stored composition is a Background; the listing trusts storage and the renderer takes it as-is */
          <BundleContainer band={parsed.data.band as BundleBandData} name={name} width={width} />
        ) : (
          <NeutralFace name={name} width={width} aspect={BUNDLE_ASPECT} />
        )}
      </BundleBlock>
    );
  }

  if (type === 'deck') {
    const parsed = cardbackFaceSchema.safeParse(data);
    if (parsed.success) {
      const cardback = parsed.data.cardback;
      return (
        <CardFrame width={width}>
          <CardBack
            name={cardback.name}
            /* the stored composition is a Background and the image an asset path; the
               listing trusts storage and the renderer takes them as-is */
            background={cardback.background as never}
            image={cardback.image as never}
            imageOffset={cardback.imageOffset ?? [0, 0]}
            imageScale={cardback.imageScale}
          />
        </CardFrame>
      );
    }
    return <NeutralFace name={name} width={width} aspect={CARD_ASPECT} />;
  }

  const shape = tokenShapeOfType(type);
  /*
   * The rectangle is a token by shape and by backside rules, and a different model by face.
   * It parses with its own schema rather than the round one, which would reject a placed composition outright and leave every rectangle drawing as a neutral face.
   */
  if (shape === 'rectangle') {
    const parsed = rectangleFaceSchema.safeParse(data);
    const face = faceForSide(parsed.success ? parsed.data : undefined, side);
    if (face) {
      return (
        <TokenFrame shape={shape} width={width}>
          <RectangleToken
            /* the listing trusts storage and the renderer takes these as-is, the same bargain the other faces make */
            background={face.background as never}
            ring={face.ring ?? false}
            decals={(face.decals ?? []) as never}
            texts={(face.texts ?? []) as never}
          />
        </TokenFrame>
      );
    }
    return <NeutralFace name={name} width={width} aspect={assetFaceAspect(type)} />;
  }
  if (shape) {
    const parsed = tokenFaceSchema.safeParse(data);
    const face = faceForSide(parsed.success ? parsed.data : undefined, side);
    if (face) {
      return (
        <TokenFrame shape={shape} width={width}>
          <CustomToken
            background={face.background as never}
            image={face.image as never}
            circle={face.ring ?? shape === 'round'}
            top={face.top || undefined}
            bottom={tokenBottom(face)}
            size={tokenSymbolSize(face)}
          />
        </TokenFrame>
      );
    }
    return <NeutralFace name={name} width={width} aspect={assetFaceAspect(type)} />;
  }

  return <NeutralFace name={name} width={width} aspect={1} />;
}
