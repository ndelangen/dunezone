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
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { TreacheryAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

export const CARD_ASPECT = CARD_SIZE.height / CARD_SIZE.width;

/** A rectangle token is wider than it is tall; every other token shape is square. */
const RECTANGLE_TOKEN_ASPECT = 0.62;

/** a cog silhouette for gear tokens — 10 teeth, alternating outer/inner radius */
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
 * Which face of a token to draw.
 * `back` falls through to the neutral face when the token has no authored back, since a referenced back is another token's front and only the caller holds that token.
 */
export type AssetFaceSide = 'front' | 'back';

/**
 * The height of a type's face as a multiple of its width.
 * One place, because the frames below and every caller that has to reserve space for a face were otherwise deriving the same three numbers separately.
 */
export function assetFaceAspect(type: string): number {
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
    case 'token-round':
      return 'round';
    case 'token-gear':
      return 'gear';
    case 'token-square':
      return 'square';
    case 'token-rectangle':
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
}: {
  type: string;
  data: unknown;
  name: string;
  width: number;
  side?: AssetFaceSide;
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
  if (shape) {
    const parsed = tokenFaceSchema.safeParse(data);
    const back = parsed.success ? parsed.data.back : undefined;
    const face =
      side === 'back'
        ? back?.mode === 'custom'
          ? back.face
          : undefined
        : parsed.success
          ? parsed.data.front
          : undefined;
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
