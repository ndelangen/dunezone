/**
 * Defensive asset-face rendering, wherever an Asset has to be shown rather than named.
 *
 * It left `src/app/routes` the moment something outside the assets routes needed it.
 * A picker row draws the same face as a browse tile, and a file only its own routes may import cannot serve both.
 *
 * Listing `data` arrives untyped (the per-type Zod schemas live with the editors), so each adapter safeParses just enough to hand the real game renderer its props, and anything unrenderable falls back to a neutral face rather than crashing a browse page.
 * The scale frames wrap the renderers' intrinsic sizes (cards draw at 900x1263, tokens fill).
 *
 * A face fills the width it is given and takes its height from `assetFaceAspect`, so it is placed by sizing its parent (#706).
 * It was once handed a pixel width instead, which made every caller state a size the face already knew: six of them wrapped it in a `CanvasScale` restating the same 900 and the same ratio, and the landing page ran a `ResizeObserver` whose entire output was that one prop.
 * A surface needing exact pixels still gets them, by giving the face a fixed-size parent, so there is never a second way to say the same thing.
 */
import { Text } from '@mantine/core';
import { NO_DECK_BACK_HREF } from '@shared/asset-publishing/fallbacks';
import {
  BundleBand,
  CardBack as CardBackContract,
  RectangleTokenFace,
  TokenFace,
  TreacheryAsset,
} from '@shared/assets/schema';
import { CanvasScale } from '@ui/layout/CanvasScale';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { CardBack } from '@game/assets/card/Back';
import { CustomToken } from '@game/assets/token/Custom';
import { RectangleToken } from '@game/assets/token/Rectangle';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { card as CARD_SIZE } from '@game/data/sizes';

import { BUNDLE_ASPECT, BundleContainer } from './BundleContainer';

const CARD_ASPECT = CARD_SIZE.height / CARD_SIZE.width;

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
 * The browse tile clips, in `OpenableTile`'s art box, and without this the corner of the most-tilted member was cut: 10px off a 352px face, and only on the members whose artwork reaches their own corners, which is why a disc token looked fine beside a clipped enhance token.
 * Nothing clips it on the detail page, where the same shortfall would put a member's corner over the caption instead, so the reservation is what keeps the block honest about its own height either way.
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

/** a cog silhouette for the tech token's frame, 10 teeth, alternating outer/inner radius */
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

/**
 * The card's corner, as a share of its own box rather than a pixel count read off a width.
 *
 * `border-radius` in the two-value percentage form takes its horizontal radius from the box's width and its vertical from its height, so dividing the second by `CARD_ASPECT` keeps the corner circular at every size, which is what `width / 18` did arithmetically.
 * A percentage rather than a container unit because `cqw` inside an element resolves against its *ancestor* container, never against the element declaring the containment, so the frame cannot read its own width that way.
 */
const CARD_CORNER = `${100 / 18}% / ${100 / (18 * CARD_ASPECT)}%`;

/**
 * A card filling the width it is given, scaled from the renderers' intrinsic 900x1263.
 * Exported for the same reason `TokenFrame` is: an editor drawing its own live draft wants the frame the catalogue surfaces use, and has no business routing a draft through the listing parse to get it.
 *
 * The fit is `CanvasScale`'s, not a second copy of it: this is exactly the case it was written for, a fixed canvas that has to land inside whatever box it is put in.
 * All this adds is the catalogue's card decoration, which is why it goes through `frameStyle`.
 */
export function CardFrame({ children }: { children: ReactNode }) {
  return (
    <CanvasScale
      canvasWidth={CARD_SIZE.width}
      canvasHeight={CARD_SIZE.height}
      frameStyle={{
        borderRadius: CARD_CORNER,
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        /* Defends the ratio, not a width: as a flex item in a column a face without this is squashed below its own height. */
        flexShrink: 0,
      }}
    >
      {children}
    </CanvasScale>
  );
}

type TokenShape = 'round' | 'gear' | 'square' | 'rectangle';

/**
 * The height of a token shape as a multiple of its width.
 * Read by the frame that draws one and by `assetFaceAspect`, which used to answer the same question from its own copy of this switch.
 */
function tokenShapeAspect(shape: TokenShape): number {
  return shape === 'rectangle' ? RECTANGLE_TOKEN_ASPECT : 1;
}

/**
 * One token face filling the width it is given, clipped to its shape.
 * No scaling: the token renderers fill their box rather than drawing at an intrinsic size, so the shape's own ratio is the whole of the geometry.
 */
export function TokenFrame({ shape, children }: { shape: TokenShape; children: ReactNode }) {
  const gear = shape === 'gear';
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: `1 / ${tokenShapeAspect(shape)}`,
        position: 'relative',
        borderRadius: shape === 'round' ? '50%' : gear ? undefined : 8,
        clipPath: gear ? GEAR_CLIP : undefined,
        overflow: 'hidden',
        boxShadow: gear ? undefined : '0 2px 10px rgba(0,0,0,0.45)',
        filter: gear ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' : undefined,
        /* Defends the ratio, not a width: as a flex item in a column a face without this is squashed below its own height. */
        flexShrink: 0,
      }}
    >
      <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>{children}</div>
    </div>
  );
}

function NeutralFace({ name, aspect }: { name: string; aspect: number }) {
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
        width: '100%',
        aspectRatio: `1 / ${aspect}`,
        /* Border inside the ratio box, for the reason `BundleContainer` states: the app's baseline is `content-box`, and a face that overruns its parent by its own border is not the aspect it just promised. */
        boxSizing: 'border-box',
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--mantine-color-default)',
        border: '1px solid var(--mantine-color-default-border)',
        /* Defends the ratio, not a width: as a flex item in a column a face without this is squashed below its own height. */
        flexShrink: 0,
      }}
    >
      <Text fw={700} c="dimmed">
        {initials || '?'}
      </Text>
    </div>
  );
}

/*
 * The editors own the full schemas; listings ask only for what a face render needs.
 * Each schema below is the stored one with fields relaxed, never a restatement of it: whatever a face hands straight
 * to a renderer comes off `src/shared/assets/schema`, the same Zod every write is parsed through
 * (`parseAssetDataForWrite`). Declaring `background: unknown` here and asserting it back at the JSX put an unchecked
 * value in front of the renderer, which is the one thing the neutral face exists to prevent.
 * What each schema relaxes, and why, is stated where it relaxes it.
 */
/* A bundle draws its authored band and nothing else; its members are the caller's to supply. */
const bundleFaceSchema = z.object({
  band: BundleBand.loose(),
});

/**
 * Whether this listing row is a deck whose referenced cardback no longer resolves.
 *
 * `cardback: null` is the presentation marker the listing join sets and only it sets;
 * the stored shape never holds null, so a row reaching here with one has been through that join.
 */
function danglingDeckCardback(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'cardback' in data && data.cardback === null;
}

/*
 * A deck's cardback, at the contract the renderer draws, with two relaxations rather than one.
 * `imageOffset` becomes optional because the call site defaults it, so a row stored before the field existed draws
 * centred rather than falling to the neutral face.
 * `loose()` is the second and the load-bearing one: `assets_deck_cardback_wrap_v1` tags an authored cardback
 * `mode: 'custom'`, and `presentedData` passes a non-reference deck through untouched, so the extra key arrives here.
 * Tightening this wrapper back to strict would turn every migrated deck into a neutral face without a type error.
 */
const cardbackFaceSchema = z.object({
  cardback: CardBackContract.partial({ imageOffset: true }).loose(),
});

/**
 * One drawable token face.
 * Loose on purpose: the editors own the full schema, and a listing that refused to draw a face over one unexpected key would be worse than one that draws it.
 * The mask names what this boundary relaxes, not what a face has: the five label, scale and ring fields are optional here because the render call below defaults every one of them, so a token stored before any of them existed draws rather than falling to the neutral face.
 * `background` and `image` are absent from the mask deliberately.
 * They are what the renderer cannot default, so a face missing either has nothing to draw and belongs on the neutral path.
 */
const drawableTokenFace = TokenFace.partial({
  symbolScale: true,
  top: true,
  bottomFirst: true,
  bottomSecond: true,
  ring: true,
}).loose();

const tokenFaceSchema = z.object({
  front: drawableTokenFace,
  /*
   * A referenced back stores no face; the caller resolves it to the other token. A same back repeats the front.
   * `catch` keeps an unreadable back from blanking a good front. Both faces come out of one parse, so without it a
   * back that fails takes the front down with it and a token that half draws draws nothing. An unreadable back
   * reads as no back, which is already what a referenced back does, and only the back side falls to neutral.
   */
  back: z
    .union([
      z.looseObject({ mode: z.literal('custom'), face: drawableTokenFace }),
      z.looseObject({ mode: z.literal('same') }),
      z.looseObject({ mode: z.literal('reference') }),
    ])
    .optional()
    .catch(undefined),
});

type DrawableTokenFace = z.infer<typeof drawableTokenFace>;

/**
 * One drawable rectangle face.
 * Loose for the same reason as the round shapes.
 * The mask relaxes the ring and the two element lists, all three defaulted by the render call below, so a face authored before either list existed still draws its background.
 * `background` stays required for the same reason it does on a token face.
 */
const drawableRectangleFace = RectangleTokenFace.partial({ ring: true, decals: true, texts: true }).loose();

const rectangleFaceSchema = z.object({
  front: drawableRectangleFace,
  /* Same back rules and the same `catch` as the round shapes, for the same reason. */
  back: z
    .union([
      z.looseObject({ mode: z.literal('custom'), face: drawableRectangleFace }),
      z.looseObject({ mode: z.literal('same') }),
      z.looseObject({ mode: z.literal('reference') }),
    ])
    .optional()
    .catch(undefined),
});

/**
 * Which of a token's two faces to draw.
 * Both token models store their backside identically, so this is one rule rather than one per model.
 * A `same` back draws the front, its decided meaning.
 * A referenced back returns nothing, since it is another token's back and only the caller holds that token.
 */
function faceForSide<TFace>(
  parsed:
    | {
        front: TFace;
        back?: { mode: 'custom'; face: TFace } | { mode: 'same' } | { mode: 'reference'; asset_id?: string };
      }
    | undefined,
  side: AssetFaceSide
): TFace | undefined {
  if (!parsed) {
    return undefined;
  }
  if (side === 'back') {
    if (parsed.back?.mode === 'custom') {
      return parsed.back.face;
    }
    return parsed.back?.mode === 'same' ? parsed.front : undefined;
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
  /* No token shape means no token, and every remaining type draws at card proportions. */
  const shape = tokenShapeOfType(type);
  return shape === null ? CARD_ASPECT : tokenShapeAspect(shape);
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
function PeekingMembers({ members }: { members: AssetFaceMember[] }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'start center' }}>
      {members.slice(0, PEEKING_LIMIT).map((member, index) => {
        const placement = MEMBER_PEEK[index] ?? MEMBER_PEEK[1]!;
        return (
          <div
            key={member.id}
            style={{
              gridArea: '1 / 1',
              /*
               * Every one of these was already a fraction of the container's width, so each is now that
               * same fraction of `100cqw`, which `BundleBlock` declares. The rise reads as a share of the
               * block rather than of the member because a `translate` percentage resolves against the
               * element's own box, and a member's height varies with its type while the ratio does not.
               */
              width: `calc(100cqw * ${MEMBER_WIDTH_RATIO})`,
              transform: `translate(calc(100cqw * ${placement.left}), calc(100cqw * ${-MEMBER_WIDTH_RATIO * MEMBER_RISE_RATIO})) rotate(${placement.rotation}deg)`,
            }}
          >
            <AssetFace type={member.type} data={member.data} name={member.name} />
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
function BundleBlock({ members, children }: { members: AssetFaceMember[]; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `1 / ${BUNDLE_ASPECT + bundleHeadroom(members.length)}`,
        /* The block is what a peeking member measures itself against, and it is the only box here whose width is the one the caller gave. */
        containerType: 'inline-size',
        /*
         * The block is the flex item, so it is the only box that can refuse to be squashed: the container
         * below it is absolutely positioned and cannot resist from in there, whatever it declares.
         * Measured in a 300x200 column with `min-height: 0`, which any flex layout may carry: without this the
         * block collapses from 250.6px to 60px while the container keeps drawing 186px, and since the container
         * is pinned to the block's bottom edge, the 126px it gains goes upward over whatever sits above it.
         */
        flexShrink: 0,
      }}
    >
      {/* Pinned to the container's own box rather than the block's, so the two stay aligned whenever the headroom changes. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, aspectRatio: `1 / ${BUNDLE_ASPECT}` }}>
        {members.length > 0 ? <PeekingMembers members={members} /> : null}
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Renders one asset's face, framed and clipped per its type.
 * Unknown types and unrenderable data come back as the neutral face, never a crash.
 *
 * The face fills its parent's width and takes its height from `assetFaceAspect`, so it is placed by sizing that parent.
 * `side` picks which face of a token to draw and is ignored by every other type.
 * A token whose back is a *reference* draws nothing here: that back is another token's front, and only a caller holding that token's own row can supply it.
 */
export function AssetFace({
  type,
  data,
  name,
  side = 'front',
  members = [],
}: {
  type: string;
  data: unknown;
  name: string;
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
        <CardFrame>
          <TreacheryCard {...parsed.data} />
        </CardFrame>
      );
    }
    return <NeutralFace name={name} aspect={assetFaceAspect(type)} />;
  }

  if (type === 'bundle') {
    const parsed = bundleFaceSchema.safeParse(data);
    return (
      <BundleBlock members={members}>
        {parsed.success ? (
          <BundleContainer band={parsed.data.band} name={name} />
        ) : (
          <NeutralFace name={name} aspect={BUNDLE_ASPECT} />
        )}
      </BundleBlock>
    );
  }

  if (type === 'deck') {
    /*
     * The listing marks a dangling reference by nulling the cardback, and nothing else produces that
     * («How browse surfaces get a referenced deck's cardback»). Keyed on the marker rather than on a
     * failed parse, so a malformed legacy row still falls to the neutral face: `[?]` claims the deck
     * loaded and its back is gone, which is a different sentence from "this row would not read".
     */
    if (danglingDeckCardback(data)) {
      return (
        <CardFrame>
          {/*
           * Drawn at the frame's internal canvas size, not the caller's width: `CardFrame` lays its
           * children out at `CARD_SIZE` and scales the lot by `width / CARD_SIZE.width`, so a child
           * sized to `width` is scaled a second time and lands at `width² / 900`. On a browse tile
           * that is a few pixels of image inside an empty card.
           * Decorative: the detail page carries the words, and a tile has no room for them.
           */}
          <img src={NO_DECK_BACK_HREF} alt="" width={CARD_SIZE.width} height={CARD_SIZE.height} />
        </CardFrame>
      );
    }
    const parsed = cardbackFaceSchema.safeParse(data);
    if (parsed.success) {
      const cardback = parsed.data.cardback;
      return (
        <CardFrame>
          <CardBack
            name={cardback.name}
            background={cardback.background}
            image={cardback.image}
            imageOffset={cardback.imageOffset ?? [0, 0]}
            imageScale={cardback.imageScale}
          />
        </CardFrame>
      );
    }
    return <NeutralFace name={name} aspect={assetFaceAspect(type)} />;
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
        <TokenFrame shape={shape}>
          <RectangleToken
            background={face.background}
            ring={face.ring ?? false}
            ringShadow={face.ringShadow ?? false}
            decals={face.decals ?? []}
            texts={face.texts ?? []}
          />
        </TokenFrame>
      );
    }
    return <NeutralFace name={name} aspect={assetFaceAspect(type)} />;
  }
  if (shape) {
    const parsed = tokenFaceSchema.safeParse(data);
    const face = faceForSide(parsed.success ? parsed.data : undefined, side);
    if (face) {
      return (
        <TokenFrame shape={shape}>
          <CustomToken
            background={face.background}
            image={face.image}
            circle={face.ring ?? shape === 'round'}
            circleShadow={face.ringShadow ?? false}
            top={face.top || undefined}
            bottom={tokenBottom(face)}
            size={tokenSymbolSize(face)}
          />
        </TokenFrame>
      );
    }
    return <NeutralFace name={name} aspect={assetFaceAspect(type)} />;
  }

  return <NeutralFace name={name} aspect={assetFaceAspect(type)} />;
}
