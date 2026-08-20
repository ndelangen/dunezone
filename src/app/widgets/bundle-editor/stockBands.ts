import type { BundleBandData } from '@app/widgets/asset-face/BundleContainer';
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
 * Scalars field by field, `colors` alone by stringify.
 * A band that round-tripped through the database is a clone of its preset carrying Zod's key order, so a whole-object stringify reports every stock band as custom;
 * `colors` is an array whose element order is the contract, so its stringify is stable, and a colour element may be a gradient object that reference equality would never match.
 * `sameCardback` and the card editor's `sameBackground` follow the same split.
 */
function sameBand(left: BundleBandData, right: BundleBandData): boolean {
  return (
    left.label === right.label &&
    left.background.image === right.background.image &&
    left.background.invert === right.background.invert &&
    left.background.definition === right.background.definition &&
    left.background.influence === right.background.influence &&
    JSON.stringify(left.background.colors) === JSON.stringify(right.background.colors)
  );
}

/** The stock key a composition matches, or null when it was authored. */
export function stockBandKeyFor(band: BundleBandData): string | null {
  return STOCK_BANDS.find((stock) => sameBand(stock.band, band))?.key ?? null;
}
