import { z } from 'zod';

import { publishedR2Key, matchPublishedPath } from './asset-publishing/publicationTargets';
import { matchUserImagePath } from './user-images/contract';

export const SOCIAL_CARD_PATH = '/social/image.png';
export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;
const SOCIAL_CARD_URL_LIMIT = 4096;

const artworkTypes = new Set([
  'faction-token',
  'card-treachery',
  'card-spice',
  'card-custom',
  'deck',
  'cardback-preset',
  'token-disc',
  'token-tech',
  'token-plate',
  'token-enhance',
  'rulebook-first-page',
]);

/** Only public JPEG publications and content-addressed user images may supply artwork. */
export function socialArtwork(path: string) {
  const userImageKey = matchUserImagePath(path);
  if (userImageKey) {
    return { bucket: 'USER_IMAGE_BUCKET' as const, key: userImageKey };
  }
  const target = matchPublishedPath(path);
  return target && artworkTypes.has(target.assetType)
    ? { bucket: 'ASSET_BUCKET' as const, key: publishedR2Key(target.assetType, target.assetId) }
    : null;
}

function normalize(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function text(limit: number) {
  return z
    .string()
    .max(limit * 2)
    .transform(normalize)
    .refine((value) => Array.from(value).length <= limit);
}

const inputSchema = z.strictObject({
  v: z.literal('1'),
  name: text(78),
  kind: text(40),
  text: text(180).default(''),
  shape: z.enum(['round', 'portrait', 'landscape']).default('portrait'),
  art: z
    .string()
    .max(180)
    .refine((value) => value === '' || socialArtwork(value) !== null)
    .default(''),
  revision: z
    .string()
    .max(64)
    .regex(/^[\w.:-]*$/)
    .default(''),
});
export type SocialCardInput = z.infer<typeof inputSchema>;

/** Parsing precedes artwork I/O and removes alternative encodings from future cache keys. */
export function parseSocialCard(url: URL): SocialCardInput | null {
  if (url.href.length > SOCIAL_CARD_URL_LIMIT) {
    return null;
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (!Object.hasOwn(inputSchema.shape, key) || Object.hasOwn(fields, key)) {
      return null;
    }
    Object.defineProperty(fields, key, { value, enumerable: true });
  }
  const result = inputSchema.safeParse(fields);
  return result.success ? result.data : null;
}

export function socialCardPath(input: SocialCardInput): string {
  const query = new URLSearchParams({
    v: input.v,
    name: input.name,
    kind: input.kind,
    text: input.text,
    shape: input.shape,
    art: input.art,
    revision: input.art ? input.revision : '',
  });
  return `${SOCIAL_CARD_PATH}?${query}`;
}

export function clipSocialCardText(value: string, limit: number): string {
  const chars = Array.from(normalize(value));
  return chars.length > limit
    ? `${chars
        .slice(0, limit - 1)
        .join('')
        .trimEnd()}…`
    : chars.join('');
}

/** The HTML owns the words; a revision is a cache hint, never a request for historical artwork. */
export function socialCardHref(input: {
  name: string;
  kind: string;
  description: string;
  image?: string | null;
  shape?: SocialCardInput['shape'];
}): string {
  const artwork = new URL(input.image || '/', 'https://dune.zone');
  const art = artwork.origin === 'https://dune.zone' && socialArtwork(artwork.pathname) ? artwork.pathname : '';
  const revision = artwork.searchParams.get('v') ?? artwork.searchParams.get('componentRevision') ?? '';
  return socialCardPath({
    v: '1',
    name: clipSocialCardText(input.name, 78),
    kind: clipSocialCardText(input.kind, 40),
    text: clipSocialCardText(input.description, 180),
    shape: input.shape ?? 'portrait',
    art,
    revision: /^[\w.:-]{0,64}$/.test(revision) ? revision : '',
  });
}
