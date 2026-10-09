import { FORMAT_EXTENSION, categoryForKey, ruleForKey } from '../assetRules';
import { MEDIA_CANONICAL_RECIPES, MEDIA_MAP } from './map.generated';
import { resolveAsset } from './resolveAsset';

const TIER_PATH = /^(.+)-(small|large|print)\.(jpg|webp|png)$/;
const KEY_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const;

/** The variant behind a canonical URL such as `/image/texture/021.jpg`: the capped re-encode in the original's own format. */
function canonicalVariant(key: string): string | null {
  const source = MEDIA_MAP[key]?.[0];
  const format = /\.png$/i.test(key) ? 'png' : 'jpeg';
  const recipe = MEDIA_CANONICAL_RECIPES[categoryForKey(key) ?? '']?.[format];
  return source && recipe ? `${source}.${recipe}.${FORMAT_EXTENSION[format]}` : null;
}

/** The variant behind a tier URL such as `/image/texture/021-small.jpg`, when the key's category declares that tier in that format. */
function tierVariant(pathname: string): string | null {
  const match = pathname.match(TIER_PATH);
  if (!match) {
    return null;
  }
  const [, base, tier, extension] = match as unknown as [string, string, 'small' | 'large' | 'print', string];
  const key = KEY_EXTENSIONS.map((candidate) => `${base}${candidate}`).find((candidate) => MEDIA_MAP[candidate]);
  const rule = key ? ruleForKey(key) : undefined;
  if (!key || rule?.sizes[tier] === undefined || FORMAT_EXTENSION[rule.format] !== extension) {
    return null;
  }
  const resolved = resolveAsset(key, tier);
  return resolved.startsWith('/m/') ? resolved.slice('/m/'.length) : null;
}

/**
 * The `/m` variant name a legacy raster URL stands for (#1888), such as `/image/texture/021-small.jpg` or the canonical `/image/texture/021.jpg`, or null when the lock does not list it.
 * Published rulebook HTML and CSS embed these URLs, so the publisher keeps answering them from R2 once static media leaves the deploy.
 */
export function legacyVariant(pathname: string): string | null {
  return MEDIA_MAP[pathname] ? canonicalVariant(pathname) : tierVariant(pathname);
}
