import type { BundleBandData } from '@app/widgets/asset-face/BundleContainer';
import { sameBackground } from '@app/widgets/background-composer/presetChoice';
import { backgroundPresets } from '@game/data/backgrounds';

/**
 * The product's own bands, defined in code rather than stored.
 *
 * A bundle publishes nothing, so unlike a stock cardback these supply only what the interface draws.
 * They exist for the same reason stock cardbacks do: a bundle made in ten seconds should still look like something rather than like a default, and «What a bundle looks like» settled that a bundle is identified by its band.
 *
 * Which stock band was chosen is deliberately not stored.
 * The stored shape is the composition itself, and the editor recovers the choice by comparing values, the same way the deck editor recovers a stock cardback and the card editor recovers a background preset.
 *
 * This lives in `src/app` rather than `src/shared` because it reaches for `@game` presets, and `src/shared` is server-reachable and may not import the browser-only renderers.
 */
export const STOCK_BANDS: { key: string; label: string; band: BundleBandData }[] = [
  { key: 'tech', label: 'Tech', band: { background: backgroundPresets.special, label: 'Tech' } },
  { key: 'weapon', label: 'Weapon', band: { background: backgroundPresets.weapon, label: 'Weapons' } },
  { key: 'defense', label: 'Defense', band: { background: backgroundPresets.defense, label: 'Defense' } },
  { key: 'worthless', label: 'Worthless', band: { background: backgroundPresets.worthless, label: 'Worthless' } },
];

/**
 * The band's own label compares directly;
 * the embedded background delegates to `sameBackground`, which owns the colors-by-stringify convention.
 */
function sameBand(left: BundleBandData, right: BundleBandData): boolean {
  return left.label === right.label && sameBackground(left.background, right.background);
}

/** The stock key a composition matches, or null when it was authored. */
export function stockBandKeyFor(band: BundleBandData): string | null {
  return STOCK_BANDS.find((stock) => sameBand(stock.band, band))?.key ?? null;
}
