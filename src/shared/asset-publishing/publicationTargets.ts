/**
 * What each publishable asset type produces, and where it lives.
 *
 * One table with four readers.
 * The browser driver captures through it (`workers/publisher/browser.ts`), the worker stores through it (`workers/publisher/r2.ts`) and serves through it (`workers/publisher/delivery.ts`), and
 * Convex builds the public URL from it (`convex/assetPublishingStatus.ts`).
 * Publishing a new kind of thing is a row here rather than five files whose string literals have to be kept in agreement by hand.
 *
 * The public path and the R2 key derive from the same two fields on purpose, since they differ only by the
 * `/published` prefix.
 * Letting those two drift is how a stored object becomes unreachable while every test still passes.
 */

/** The wire vocabulary. Order is not meaningful; `matchPublishedPath` tries every entry. */
export const PUBLICATION_ASSET_TYPES = [
  'faction_sheet',
  'card-treachery',
  'deck',
  'token-round',
  'token-gear',
  'token-square',
  'token-rectangle',
] as const;

export type PublicationAssetType = (typeof PUBLICATION_ASSET_TYPES)[number];

/**
 * How the browser driver turns a capture page into bytes.
 *
 * `pdf` keeps the paged geometry in `PUBLISHER_RENDERER_CONTRACT`, since page count and MediaBox millimetres are facts about PDF rather than about the asset.
 * `image` carries its own geometry, because the viewport *is* the output: the capture frame draws at its renderer's intrinsic size and the screenshot is that viewport, so one CSS pixel is one image pixel and nothing resamples.
 */
export type PublicationCapture =
  | { readonly output: 'pdf' }
  | {
      readonly output: 'image';
      readonly widthPx: number;
      readonly heightPx: number;
      /**
       * Passed to the Images binding, which exposes quality and nothing else.
       * A visual call rather than a size target: JPEG turns fine grain into directional streaks long before it turns expensive.
       */
      readonly jpegQuality: number;
      /** A ceiling on the encoded JPEG, sized to catch something pathological rather than to shape the output. */
      readonly maxBytes: number;
    };

export type PublicationTarget = {
  /** First path segment under `/published/`, and the R2 prefix. Plural, since it names a collection. */
  collection: string;
  /** The leaf the path ends in, extension included. */
  file: string;
  contentType: string;
  /** What a browser calls the file when it saves it, which is not what R2 calls it. */
  downloadFilename: string;
  capture: PublicationCapture;
  /**
   * Faces this type publishes beside the one under its bare asset id.
   * A token publishes two artifacts, and «Token multi-face publication model» put the qualification in the id rather than in a second type, so `{id}` is the front and `{id}.back` is the back.
   * Declaring it per row rather than widening the id pattern globally keeps every type that has no second face exactly as strict as it was.
   */
  faces?: readonly PublicationFace[];
};

/**
 * The faces a publication may have beyond its default one.
 * The default face has no name, because it is the asset itself.
 */
export type PublicationFace = 'back';

/**
 * The four token shapes, which differ only in the clip their renderer draws through and therefore only in geometry.
 * Sizes are each renderer's own, from `@game/data/sizes`, the same justification the card row carries: `disc` for the three round shapes and `tokenRectangle` for the fourth.
 * Both axes sit far above the 50 pixel per-axis floor below which the encoder drops to baseline, which is what the encode spike actually established.
 *
 * Every row declares a `back`, because every token has one.
 * A token whose back is a reference publishes only its front;
 * that is an enqueue-time rule rather than a shape of the table, since the same token can switch modes without changing type.
 */
const TOKEN_TARGETS = {
  'token-round': tokenTarget('round', 600, 600),
  'token-gear': tokenTarget('gear', 600, 600),
  'token-square': tokenTarget('square', 600, 600),
  'token-rectangle': tokenTarget('rectangle', 600, 372),
} as const satisfies Record<string, PublicationTarget>;

function tokenTarget(shape: string, widthPx: number, heightPx: number): PublicationTarget {
  return {
    collection: `${shape}-tokens`,
    file: 'token.jpg',
    contentType: 'image/jpeg',
    downloadFilename: `${shape}-token.jpg`,
    capture: { output: 'image', widthPx, heightPx, jpegQuality: 88, maxBytes: 2_000_000 },
    faces: ['back'],
  };
}

export const PUBLICATION_TARGETS: Record<PublicationAssetType, PublicationTarget> = {
  faction_sheet: {
    collection: 'factions',
    file: 'sheet.pdf',
    contentType: 'application/pdf',
    downloadFilename: 'faction-sheet.pdf',
    capture: { output: 'pdf' },
  },
  /* 900x1263 is the treachery renderer's own size, from `@game/data/sizes`. */
  'card-treachery': {
    collection: 'cards',
    file: 'card.jpg',
    contentType: 'image/jpeg',
    downloadFilename: 'treachery-card.jpg',
    capture: { output: 'image', widthPx: 900, heightPx: 1263, jpegQuality: 88, maxBytes: 2_000_000 },
  },
  /*
   * A deck publishes its Cardback and nothing else (wayfinder #495), so the row is a card in every dimension that matters.
   * `CardBack` is the card renderer at the card's own size, and the quality number was measured on that renderer's output.
   */
  deck: {
    collection: 'decks',
    file: 'cardback.jpg',
    contentType: 'image/jpeg',
    downloadFilename: 'deck-cardback.jpg',
    capture: { output: 'image', widthPx: 900, heightPx: 1263, jpegQuality: 88, maxBytes: 2_000_000 },
  },
  ...TOKEN_TARGETS,
};

/**
 * What may sit in the id position of a *public path*, which is stricter than what may sit in an R2 key.
 * Published URLs key on the id and never the slug: a rename re-slugs an Asset, and a published URL that moved on rename would break every embed of it while orphaning the bytes it used to name.
 */
const PUBLIC_ASSET_ID_PATTERN = /^[0-9a-z]{16,64}$/;

/**
 * The id one face publishes under.
 * The default face keeps the bare asset id, so every URL published before faces existed is still the URL it was.
 */
export function publicationFaceId(assetId: string, face?: PublicationFace): string {
  return face ? `${assetId}.${face}` : assetId;
}

/**
 * Whether an id may sit in this type's public path.
 * A bare id always may.
 * A qualified one may only when the type declares that face, so widening never reaches a type that has no second face, and the id pattern itself stays exactly as narrow as it was.
 * The suffix is matched as a whole literal rather than by admitting `.` to the pattern, which would let `..` form and hand `publishedR2Key` a key that escapes its prefix.
 */
function isPublicIdForType(assetType: PublicationAssetType, assetId: string): boolean {
  if (PUBLIC_ASSET_ID_PATTERN.test(assetId)) {
    return true;
  }
  return (PUBLICATION_TARGETS[assetType].faces ?? []).some((face) => {
    const suffix = `.${face}`;
    return assetId.endsWith(suffix) && PUBLIC_ASSET_ID_PATTERN.test(assetId.slice(0, -suffix.length));
  });
}

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
  if (!isPublicIdForType(assetType, assetId)) {
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
    if (isPublicIdForType(assetType, assetId)) {
      return { assetType, assetId };
    }
  }
  return null;
}
