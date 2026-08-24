import type { BundleBand } from '@shared/assets/schema';
import type { z } from 'zod';

import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

export type BundleBandData = z.infer<typeof BundleBand>;

/** A container is wider than it is tall, the one proportion that reads as a box rather than a card. */
export const BUNDLE_ASPECT = 0.62;

/**
 * The container's corner, as a share of its own box rather than a pixel count read off a width.
 *
 * `border-radius` in the two-value percentage form takes its horizontal radius from the box's width and its vertical from its height, so dividing the second by `BUNDLE_ASPECT` keeps the corner circular at every size, which is what `width / 22` did arithmetically.
 * The floor stays: below about 90px across, a proportional corner rounds a small box into a lozenge.
 */
const CORNER = `max(4px, ${100 / 22}%) / max(4px, ${100 / (22 * BUNDLE_ASPECT)}%)`;

/** The band's share of the container's height, floored so it reads as a band rather than a line on a pile-sized container. */
const BAND_HEIGHT = 'max(14px, 34%)';

/**
 * A bundle's face: the container it authors.
 *
 * A bundle is the only Asset type with no visual identity of its own to draw from, so «What a bundle looks like» settled that it authors one.
 * The band across the middle is the authored part;
 * everything else is the house box, so two bundles are told apart by the band rather than by whoever happens to be inside them.
 *
 * It fills the width it is given and takes its height from `BUNDLE_ASPECT`, so a caller places it by sizing its parent rather than by handing it a number.
 * The label is the one part no percentage can express, since font sizes have no percentage-of-width form, so the container declares itself a query container and the label reads its own width back as `cqw`.
 *
 * Members are deliberately **not** drawn here.
 * Up to three of them peek above the container from browse-tile size upward, but only a caller holding those rows can supply them, and the landing page draws the container alone on purpose: at pile size the members resolve into a smudge, and putting member data on every catalogue row is a cost only the browse page agrees to pay.
 */
export function BundleContainer({ band, name }: { band: BundleBandData; name: string }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `1 / ${BUNDLE_ASPECT}`,
        /*
         * The app's baseline is `content-box` (see `mantine-shell-compatibility.css`), which would put the
         * border outside the ratio box and make this 2px wider and taller than the box it was told to fill.
         * A face that overruns its own parent is the one thing this component now promises not to do, and the
         * block above reserves headroom against this height, so those 2px came straight out of the reservation.
         */
        boxSizing: 'border-box',
        containerType: 'inline-size',
        borderRadius: CORNER,
        overflow: 'hidden',
        /* Defends the ratio, not a width: as a flex item in a column a face without this is squashed below its own height. */
        flexShrink: 0,
        background: 'linear-gradient(#c8b285, #9d8459)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        border: '1px solid rgba(60, 44, 20, 0.55)',
      }}
    >
      {/* Centred by the layout rather than by an offset anyone computes, so the floor above cannot push it off the middle. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: BAND_HEIGHT,
          transform: 'translateY(-50%)',
        }}
      >
        <BackgroundRenderer background={band.background} className="" />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          padding: '0 8%',
          textAlign: 'center',
          /* The band's own label when it has one, the Asset's name when it does not, so a container is never blank. */
          fontSize: 'max(7px, calc(100cqw / 13))',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1.1,
          color: '#f4ead2',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.7)',
        }}
      >
        {band.label.trim() || name}
      </div>
    </div>
  );
}
