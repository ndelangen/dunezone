/**
 * What each publishable asset type produces, and where it lives.
 *
 * One table with three readers.
 * The worker stores through it (`workers/publisher/r2.ts`) and serves through it (`workers/publisher/delivery.ts`), and
 * Convex builds the public URL from it (`convex/assetPublishingStatus.ts`).
 * Publishing a new kind of thing is a row here rather than four files whose string literals have to be kept in agreement by hand.
 *
 * The public path and the R2 key derive from the same two fields on purpose, since they differ only by the
 * `/published` prefix.
 * Letting those two drift is how a stored object becomes unreachable while every test still passes.
 */

/** The wire vocabulary. Order is not meaningful; `matchPublishedPath` tries every entry. */
export const PUBLICATION_ASSET_TYPES = ['faction_sheet'] as const;

export type PublicationAssetType = (typeof PUBLICATION_ASSET_TYPES)[number];

export type PublicationTarget = {
  /** First path segment under `/published/`, and the R2 prefix. Plural, since it names a collection. */
  collection: string;
  /** The leaf the path ends in, extension included. */
  file: string;
  contentType: string;
  /** What a browser calls the file when it saves it, which is not what R2 calls it. */
  downloadFilename: string;
};

export const PUBLICATION_TARGETS: Record<PublicationAssetType, PublicationTarget> = {
  faction_sheet: {
    collection: 'factions',
    file: 'sheet.pdf',
    contentType: 'application/pdf',
    downloadFilename: 'faction-sheet.pdf',
  },
};

/**
 * What may sit in the id position of a *public path*, which is stricter than what may sit in an R2 key.
 * Published URLs key on the id and never the slug: a rename re-slugs an Asset, and a published URL that moved on rename would break every embed of it while orphaning the bytes it used to name.
 */
const PUBLIC_ASSET_ID_PATTERN = /^[0-9a-z]{16,64}$/;

export function isPublicationAssetType(value: string): value is PublicationAssetType {
  return (PUBLICATION_ASSET_TYPES as readonly string[]).includes(value);
}

/**
 * The stable R2 key.
 * Overwritten on every publish, so versioning lives in the cache token rather than the key.
 *
 * The guard here refuses keys that would escape their prefix, which is a narrower question than whether the id is well-formed.
 * Key building and route matching had separate guards before this table existed and they keep them: a caller that already holds a job's assetId should not be told its id looks wrong.
 */
export function publishedR2Key(assetType: PublicationAssetType, assetId: string): string {
  if (!assetId || assetId.includes('/') || assetId.includes('..')) {
    throw new Error('Asset id is invalid for the stable R2 key');
  }
  const target = PUBLICATION_TARGETS[assetType];
  return `${target.collection}/${assetId}/${target.file}`;
}

/** The path half of the public URL, without the cache token that makes it fetchable. */
export function publishedPath(assetType: PublicationAssetType, assetId: string): string {
  if (!PUBLIC_ASSET_ID_PATTERN.test(assetId)) {
    throw new Error('Asset id is invalid for a published path');
  }
  const target = PUBLICATION_TARGETS[assetType];
  return `/published/${target.collection}/${encodeURIComponent(assetId)}/${target.file}`;
}

/** The whole public URL. A fresh token per publish is what makes this a new URL and therefore a cold cache. */
export function publishedHref(assetType: PublicationAssetType, assetId: string, cacheToken: string): string {
  return `${publishedPath(assetType, assetId)}?v=${encodeURIComponent(cacheToken)}`;
}

/** Reverses `publishedPath`. Returns null for anything that is not a published artifact, including near misses. */
export function matchPublishedPath(pathname: string): { assetType: PublicationAssetType; assetId: string } | null {
  for (const assetType of PUBLICATION_ASSET_TYPES) {
    const target = PUBLICATION_TARGETS[assetType];
    const prefix = `/published/${target.collection}/`;
    const suffix = `/${target.file}`;
    if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
      continue;
    }
    const assetId = pathname.slice(prefix.length, pathname.length - suffix.length);
    if (PUBLIC_ASSET_ID_PATTERN.test(assetId)) {
      return { assetType, assetId };
    }
  }
  return null;
}
