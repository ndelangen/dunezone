import { DECAL } from '@shared/assetIds';
import { isRetiredStockAsset } from '@shared/retiredStockAssets';

import { CardFrame } from '@app/widgets/asset-face/AssetFace';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';

import styles from './ErrorCard.module.css';

/* Every stock vector decal the media catalogue offers; the bitmap decals are stronghold art and read poorly at this size. */
const decals = DECAL.options.filter((id) => id.startsWith('/vector/decal/') && !isRetiredStockAsset(id));

/**
 * Picks the decal from the address, so the server and the browser draw the same card and no decal swaps in after load.
 * Each missing address gets its own decal, which is what makes it read as a random card from the deck.
 */
function errorCardDecal(seed: string): (typeof decals)[number] {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return decals[hash % decals.length]!;
}

export interface ErrorCardProps {
  /** The card's name: what went wrong, "Page not found". */
  name: string;
  /** The card's type line: the error code, "Error 404". */
  code: string;
  /** The card's text: the one sentence that says what happened. */
  text: string;
  /** What picks the decal; the page's address. */
  seed: string;
}

/**
 * A message drawn as a treachery card dealt onto the page: the name, the error code as its type, the sentence as its text (Norbert, 2026-11-08).
 * Decorative: `PageMessage` keeps the same words in its heading and lede for screen readers, so the card is hidden from them.
 */
export function ErrorCard({ name, code, text, seed }: ErrorCardProps) {
  return (
    <div className={styles.card} aria-hidden>
      <CardFrame>
        <TreacheryCard
          name={name}
          subName={code}
          text={text}
          head={backgroundPresets.atreides}
          icon={[backgroundPresets.atreides, '/vector/icon/treachery.svg']}
          decals={[{ id: errorCardDecal(seed), muted: false, offset: [0, 0], outline: false, scale: 1.6 }]}
        />
      </CardFrame>
    </div>
  );
}
