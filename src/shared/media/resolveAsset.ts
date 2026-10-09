import { FORMAT_EXTENSION, categoryForKey, ruleForKey } from '../assetRules';
import type { AssetSize } from '../assetRules';
import { MEDIA_MAP, MEDIA_RECIPES } from './map.generated';

const RASTER_KEY = /\.(png|jpe?g)$/i;

/**
 * Resolves an opaque asset key (e.g.
 * `/image/texture/021.jpg`, stored on faction documents) to the generated variant
 * URL for a size tier: pure string logic over the shared rules table and the committed media map, so the app, Storybook, the print preview, and the publisher capture all resolve identical URLs (#254).
 *
 * A locked raster resolves to its content-addressed variant `/m/<src20>.<recipe10>.<ext>` (#1888 step 5), which never changes meaning and is served immutably.
 * A raster the lock does not list yet, such as art dropped into `media/image/` and not yet synced, keeps its legacy path (`/image/texture/021-small.jpg`), which local builds still materialise.
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
  const extension = FORMAT_EXTENSION[rule.format];
  const source = MEDIA_MAP[key]?.[0];
  const recipe = MEDIA_RECIPES[categoryForKey(key) ?? '']?.[tier];
  if (source && recipe) {
    return `/m/${source}.${recipe}.${extension}`;
  }
  return key.replace(RASTER_KEY, `-${tier}.${extension}`);
}
