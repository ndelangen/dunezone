import { DECAL, GENERIC, ICON, LEADERS, LOGO, TROOP, TROOP_MODIFIER } from '@game/data/generated';

export const NONE_SELECT_VALUE = '__none__';

const PREVIEWABLE_EXT = /\.(svg|png|jpg|jpeg)$/i;

export function isPreviewableAssetPath(path: string): boolean {
  return PREVIEWABLE_EXT.test(path.trim());
}

export function assetPathToPublicUrl(path: string): string {
  const p = path.trim().replace(/^\/+/, '');
  return `/${p}`;
}

export function assetOptionToPreviewSrc(path: string): string | null {
  return isPreviewableAssetPath(path) ? assetPathToPublicUrl(path) : null;
}

export function toTitleCaseWord(word: string): string {
  if (word.length === 0) return '';
  return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
}

export function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0] ?? '';
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i] ?? '';
    let j = 0;
    const max = Math.min(prefix.length, value.length);
    while (j < max && prefix[j] === value[j]) j += 1;
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) break;
  }
  const lastSlash = prefix.lastIndexOf('/');
  return lastSlash >= 0 ? prefix.slice(0, lastSlash + 1) : '';
}

export function formatPathDisplay(rawValue: string, commonPrefix: string): string {
  const raw = rawValue.trim();
  if (raw.length === 0) return rawValue;
  const withoutPrefix = raw.startsWith(commonPrefix) ? raw.slice(commonPrefix.length) : raw;
  const withoutExt = withoutPrefix.replace(/\.[^./]+$/u, '');
  const parts = withoutExt
    .split('/')
    .map((segment) =>
      segment
        .split(/[-_]+/u)
        .map((word) => toTitleCaseWord(word))
        .join(' ')
    )
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(' - ') : rawValue;
}

export function createPathOptionLabeler(options: readonly string[]): (raw: string) => string {
  const commonPrefix = longestCommonPrefix(options);
  return (raw) => formatPathDisplay(raw, commonPrefix);
}

export const logoOptions = [...LOGO.options, ...GENERIC.options] as readonly string[];

/** Decal `id` is `ALL` in schema; picker focuses on paths used on alliance cards. */
export const decalAssetOptions = [
  ...new Set([
    ...DECAL.options,
    ...ICON.options,
    ...LOGO.options,
    ...GENERIC.options,
    ...TROOP.options,
  ]),
].sort((a, b) => a.localeCompare(b)) as readonly string[];

export const logoOptionToLabel = createPathOptionLabeler(logoOptions);
export const decalAssetOptionToLabel = createPathOptionLabeler(decalAssetOptions);
export const leaderOptionToLabel = createPathOptionLabeler(LEADERS.options);
export const troopOptionToLabel = createPathOptionLabeler(TROOP.options);
export const troopStarOptionToLabel = createPathOptionLabeler(TROOP_MODIFIER.options);
