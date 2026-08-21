import type { BundleBand } from '@shared/assets/schema';
import type { z } from 'zod';

import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

export type BundleBandData = z.infer<typeof BundleBand>;

/** A container is wider than it is tall, the one proportion that reads as a box rather than a card. */
export const BUNDLE_ASPECT = 0.62;

/**
 * A bundle's face: the container it authors.
 *
 * A bundle is the only Asset type with no visual identity of its own to draw from, so «What a bundle looks like» settled that it authors one.
 * The band across the middle is the authored part;
 * everything else is the house box, so two bundles are told apart by the band rather than by whoever happens to be inside them.
 *
 * Members are deliberately **not** drawn here.
 * Up to three of them peek above the container from browse-tile size upward, but only a caller holding those rows can supply them, and the landing page draws the container alone on purpose: at pile size the members resolve into a smudge, and putting member data on every catalogue row is a cost only the browse page agrees to pay.
 */
export function BundleContainer({ band, name, width }: { band: BundleBandData; name: string; width: number }) {
  const height = width * BUNDLE_ASPECT;
  const bandHeight = Math.max(14, height * 0.34);
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: Math.max(4, width / 22),
        overflow: 'hidden',
        flexShrink: 0,
        background: 'linear-gradient(#c8b285, #9d8459)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        border: '1px solid rgba(60, 44, 20, 0.55)',
      }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: (height - bandHeight) / 2, height: bandHeight }}>
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
          fontSize: Math.max(7, width / 13),
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
