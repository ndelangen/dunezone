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
import { Treachery } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

export const CARD_ASPECT = CARD_SIZE.height / CARD_SIZE.width;

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

function TokenFrame({
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
  const height = shape === 'rectangle' ? width * 0.62 : width;
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
    label: z.string(),
    background: z.unknown(),
    image: z.string(),
    imageScale: z.number(),
    imageOffsetY: z.number().optional(),
  }),
});

const tokenFaceSchema = z.object({
  front: z.looseObject({
    background: z.unknown(),
    image: z.string(),
  }),
});

function tokenShapeOfType(type: string): TokenShape | null {
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

/**
 * Renders one asset's face at the given width, framed and clipped per its type.
 * Unknown types and unrenderable data come back as the neutral face, never a crash.
 */
export function AssetFace({ type, data, name, width }: { type: string; data: unknown; name: string; width: number }) {
  if (type === 'card-treachery') {
    const parsed = Treachery.safeParse(data);
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
            name={cardback.label}
            /* the stored composition is a Background and the image an asset path; the
               listing trusts storage and the renderer takes them as-is */
            background={cardback.background as never}
            image={cardback.image as never}
            imageOffset={[0, cardback.imageOffsetY ?? 0]}
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
    if (parsed.success) {
      return (
        <TokenFrame shape={shape} width={width}>
          <CustomToken
            background={parsed.data.front.background as never}
            image={parsed.data.front.image as never}
            circle={shape === 'round'}
          />
        </TokenFrame>
      );
    }
    return <NeutralFace name={name} width={width} aspect={shape === 'rectangle' ? 0.62 : 1} />;
  }

  return <NeutralFace name={name} width={width} aspect={1} />;
}
