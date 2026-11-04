import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { CustomCardTokens } from '@shared/assets/schema';
import { retainedArrakisBoard } from '@shared/boards/geometry';
import type { BoardTint } from '@shared/boards/markup';
import type { Board } from '@shared/boards/schema';
import { legacyHighlightTint } from '@shared/boards/spiceHighlights';
import type { FC } from 'react';
import type { z } from 'zod';

import { useResolvedCardFront } from '@game/assets/utils/BackgroundLibrary';

import { backgroundPresets } from '../../data/backgrounds';
import type { Spice } from '../../data/objects';
import { useAssetResolver } from '../assetRenderMode';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { CardTitle } from '../utils/CardTitle';
import { FormattedText } from '../utils/FormattedText';
import styles from './Card.module.css';
import { CardToken } from './CardToken';
import unique from './Spice.module.css';
import { SpiceBoardMap } from './SpiceBoardMap';
import type { SpiceMapEditing } from './SpiceBoardMap';
import { spiceIconSrc, standardSpiceText } from './spiceText';

/* A card without a board link draws the stock Arrakis board, its highlights carried over as one tint, kept per highlight list so the map is drawn once. */
const classicTintCache = new Map<string, BoardTint[]>();
function classicTints(highlights: z.infer<typeof Spice>['highlights'], subName: string): BoardTint[] {
  const key = `${subName}\u0000${highlights.join(',')}`;
  let tints = classicTintCache.get(key);
  if (!tints) {
    const tint = legacyHighlightTint(highlights, subName);
    tints = tint ? [tint] : [];
    classicTintCache.set(key, tints);
  }
  return tints;
}

/**
 * A card with a `board` link draws that board, resolved by the caller into `boardDefinition` and `boardTokens`, in place of the legacy Arrakis vector.
 * A link whose board is missing draws an empty map rather than the wrong one;
 * cards without a link keep the legacy map until Stage 1.5 migrates them.
 */
export const SpiceCard: FC<
  z.infer<typeof Spice> & {
    boardDefinition?: Board | null;
    boardTokens?: z.infer<typeof CustomCardTokens>;
    /** The editor's brush and token dragging on the linked board's map. */
    mapEditing?: SpiceMapEditing;
    frontStyle?: CardFrontStyle;
  }
> = ({
  name,
  subName,
  icon,
  iconScale = 1,
  iconOffset = [0, 0],
  text,
  amount,
  highlights,
  overlays,
  board,
  boardDefinition,
  boardTokens,
  mapEditing,
  frontStyle: suppliedFrontStyle,
}) => {
  const frontStyle = useResolvedCardFront('card-spice', {}, suppliedFrontStyle);
  const resolveOverlay = useAssetResolver();
  const iconSize = 85 * iconScale;

  return (
    <div className={styles.card} data-spice-look={board?.look?.style}>
      <BackgroundRenderer
        className={`${styles.head} ${unique.head}`}
        background={frontStyle?.head ?? backgroundPresets.spice}
      />
      <div className={styles.head_shade} />
      <div className={`${styles.shape} ${unique.shape}`} />
      <BackgroundRenderer
        className={`${styles.type} ${unique.type}`}
        background={frontStyle?.iconBackground ?? backgroundPresets.stripedSpice}
      >
        <img
          src={spiceIconSrc(icon)}
          alt=""
          className={unique.typeOverlay}
          style={{
            width: iconSize,
            height: iconSize,
            marginLeft: iconOffset[0] * 2,
            marginTop: iconOffset[1] * 2,
          }}
        />
        <img
          src={spiceIconSrc(icon)}
          alt=""
          className={unique.typeShade}
          style={{
            width: iconSize,
            height: iconSize,
            left: (125 - iconSize) / 2,
            top: (125 - iconSize) / 2,
            marginLeft: iconOffset[0],
            marginTop: iconOffset[1],
          }}
        />
      </BackgroundRenderer>
      <CardTitle className={styles.title} text={name} />
      <CardTitle className={styles.subtitle} text={subName} baseSize={40} />

      {board ? (
        boardDefinition ? (
          <SpiceBoardMap
            board={boardDefinition}
            tints={board.tints}
            tokens={board.tokens}
            tokenAssets={boardTokens}
            look={board.look}
            editing={mapEditing}
          />
        ) : (
          <div
            className={`${unique.map} ${board.look?.style === 'textured-burn' ? unique.shiftedMap : ''}`}
            data-missing-board
          />
        )
      ) : (
        <SpiceBoardMap board={retainedArrakisBoard()} tints={classicTints(highlights, subName)} />
      )}

      {/* Images an author placed on the map, in the classic map's 100-unit frame, over the classic or the linked board alike. */}
      {overlays?.length ? (
        <svg className={unique.map_overlay} viewBox="0 0 100 100" fillRule="evenodd" clipRule="evenodd">
          {overlays.map((overlay) => (
            <image
              key={`${overlay.image}-${overlay.offset[0]},${overlay.offset[1]}-${overlay.scale}`}
              href={resolveOverlay(overlay.image)}
              x={overlay.offset[0]}
              y={overlay.offset[1]}
              width={overlay.scale}
              height={overlay.scale}
            />
          ))}
        </svg>
      ) : null}

      {board?.typeToken && boardTokens?.[board.typeToken.asset_id] ? (
        <div className={unique.typeToken} data-spice-type-token>
          <CardToken token={boardTokens[board.typeToken.asset_id]!} />
        </div>
      ) : null}
      <div className={board?.typeToken ? `${unique.body} ${unique.discoveryBody}` : unique.body}>
        <div>
          <FormattedText value={text || standardSpiceText({ icon, amount, name })} />
        </div>
      </div>

      <div className={unique.count}>{amount}</div>
    </div>
  );
};
