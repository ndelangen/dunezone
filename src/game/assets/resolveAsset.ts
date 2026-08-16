import { FORMAT_EXTENSION, ruleForKey } from '../../shared/assetRules';
import type { AssetSize } from '../../shared/assetRules';

const RASTER_KEY = /\.(png|jpe?g)$/i;

/**
 * Resolves an opaque asset key (e.g.
 * `/image/texture/021.jpg`, stored on faction documents) to the generated variant
 * URL for a size tier — pure string logic over the shared rules table, so the app, Storybook, the print preview, and the publisher capture all resolve identical URLs (#254).
 *
 * Non-raster keys (vectors) and keys outside the rules table pass through unchanged.
 * `print` falls back to `large` for categories without a print tier.
 * The canonical key itself stays fetchable as a capped safety net, but rendering code should always resolve.
 */
export function resolveAsset(key: string, size: AssetSize): string {
  const rule = ruleForKey(key);
  if (!rule || !RASTER_KEY.test(key)) {
    return key;
  }
  const tier = size === 'print' && rule.sizes.print === undefined ? 'large' : size;
  return key.replace(RASTER_KEY, `-${tier}.${FORMAT_EXTENSION[rule.format]}`);
}
