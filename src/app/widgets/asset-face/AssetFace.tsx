/**
 * Defensive asset-face rendering, wherever an Asset has to be shown rather than named.
 *
 * It left `src/app/routes` the moment something outside the assets routes needed it.
 * A picker row draws the same face as a browse tile, and a file only its own routes may import cannot serve both.
 *
 * Every face but a bundle's is its publication, drawn by `PublishedImage`, which owns how it arrives and the missing state when there is none or it fails to load.
 * A bundle publishes nothing, so its container is drawn from its `data` and its members from their own publications.
 * Draft proofs never come here: the editors draw them with the renderers or `BundleContainer` directly.
 * The scale frames wrap the renderers' intrinsic sizes (cards draw at 900x1263, tokens fill).
 *
 * A face fills the width it is given and takes its height from `assetFaceAspect`, so it is placed by sizing its parent (#706).
 * It was once handed a pixel width instead, which made every caller state a size the face already knew: six of them wrapped it in a `CanvasScale` restating the same 900 and the same ratio, and the landing page ran a `ResizeObserver` whose entire output was that one prop.
 * A surface needing exact pixels still gets them, by giving the face a fixed-size parent, so there is never a second way to say the same thing.
 */
import { BundleBand } from '@shared/assets/schema';
import { PublishedImage } from '@ui/content/PublishedImage';
import { CanvasScale } from '@ui/layout/CanvasScale';
import type { ReactNode } from 'react';
import { z } from 'zod';

import type { AssetListEntry } from '@app/db/assets';
import { card as CARD_SIZE } from '@game/data/sizes';

import { BUNDLE_ASPECT, BundleContainer } from './BundleContainer';

const CARD_ASPECT = CARD_SIZE.height / CARD_SIZE.width;

/** Enough of a container's member to draw its face. The browse read and the detail page's member list both supply this shape. */
export type AssetFaceMember = Pick<AssetListEntry, 'id' | 'type' | 'name' | 'data' | 'previewHref'>;

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
 * It draws a live renderer with the corner and shadow a published card face arrives with through `PublishedImage`, around a `CanvasScale` fit.
 * Exported for the deck editor and the presets route, which draw a live renderer rather than a publication.
 *
 * The fit is `CanvasScale`'s, not a second copy of it: this is exactly the case it was written for, a fixed canvas that has to land inside whatever box it is put in.
 * All this adds is the decoration, which is why it goes through `frameStyle`.
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

/*
 * A bundle draws its authored band and nothing else; its members are the caller's to supply.
 * The band is the stored contract from `src/shared/assets/schema`, the same Zod every write is parsed through, never a restatement of it.
 * Declaring `background: unknown` here and asserting it back at the JSX once put an unchecked value in front of the renderer.
 */
const bundleFaceSchema = z.object({
  band: BundleBand.loose(),
});

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
            <AssetFace type={member.type} data={member.data} name={member.name} href={member.previewHref} />
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
      {/*
       * Pinned to the container's own box rather than the block's, so the two stay aligned whenever the
       * headroom changes.
       * Its height is stated against the block's width rather than left to `aspect-ratio`, because an
       * absolutely positioned box takes its height from its contents and `aspect-ratio` only offers a
       * preferred one: anything the container adds outside its ratio box, a border or a padding, would
       * otherwise push this box up and take that room out of the members' reservation without a word.
       */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `calc(100cqw * ${BUNDLE_ASPECT})` }}>
        {members.length > 0 ? <PeekingMembers members={members} /> : null}
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/*
 * A published face's outline and whether it wears a shadow, by type.
 * A gear is clipped rather than rounded, and a clip cuts away any shadow drawn around it.
 */
function publishedOutline(shape: TokenShape | null): { radius?: string; clipPath?: string; raised: boolean } {
  switch (shape) {
    case null:
      return { radius: CARD_CORNER, raised: true };
    case 'round':
      return { radius: '50%', raised: true };
    case 'gear':
      return { clipPath: GEAR_CLIP, raised: false };
    case 'square':
    case 'rectangle':
      return { radius: '8px', raised: true };
  }
}

/**
 * Renders one asset's face, framed and clipped per its type.
 * Callers own which publication a face shows;
 * this owns the outline and shadow each type wears, and how a bundle stands its members above its container.
 *
 * The face fills its parent's width and takes its height from `assetFaceAspect`, so it is placed by sizing that parent.
 */
export function AssetFace({
  type,
  data,
  name,
  href,
  members = [],
}: {
  type: string;
  /** Only a bundle reads this: its band. */
  data: unknown;
  name: string;
  /** The face's publication, or null when there is none, which draws the missing state. A bundle publishes nothing, so it ignores this. */
  href: string | null;
  /**
   * A container's first few members, drawn peeking above it.
   *
   * Only `bundle` reads this.
   * A deck is a container too and ignores it, because a deck wears a Cardback and is recognisable on sight.
   * «What a bundle looks like» gave the peeking members to the one type with no face of its own.
   * Empty draws the container alone, which is also what a bundle nobody has filled draws.
   */
  members?: AssetFaceMember[];
}) {
  if (type !== 'bundle') {
    return (
      <PublishedImage
        src={href}
        name={name}
        aspect={assetFaceAspect(type)}
        {...publishedOutline(tokenShapeOfType(type))}
      />
    );
  }
  const parsed = bundleFaceSchema.safeParse(data);
  return (
    <BundleBlock members={members}>
      {parsed.success ? (
        <BundleContainer band={parsed.data.band} name={name} />
      ) : (
        <PublishedImage src={null} name={name} aspect={BUNDLE_ASPECT} radius="8px" />
      )}
    </BundleBlock>
  );
}
