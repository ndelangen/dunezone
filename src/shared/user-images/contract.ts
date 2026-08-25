import { z } from 'zod';

/**
 * The contract between the app, the Convex rehost action and the Worker's user-image endpoints.
 * A user-supplied image URL is fetched once at save time, re-encoded, stored in the user-image bucket and served from our own origin from then on.
 * Everything both sides of that exchange must agree on lives here: paths, limits and the wire shapes.
 */

/** The Worker endpoint the Convex rehost action posts a source URL to, authenticated with the ingest secret. */
export const USER_IMAGE_INGEST_PATH = '/__user-images/ingest';

/** The public namespace rehosted images are served under, keyed by the content hash of the encoded bytes. */
export const USER_IMAGE_PUBLIC_PREFIX = '/user-images/';

/** The most source bytes the ingest fetch will read before giving up, so a hostile URL cannot stream forever. */
export const USER_IMAGE_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** How long the ingest fetch waits for the source host before failing the save with an honest error. */
export const USER_IMAGE_FETCH_TIMEOUT_MS = 10_000;

/** How many redirect hops the ingest fetch follows, each one re-checked to be https. */
export const USER_IMAGE_MAX_REDIRECTS = 3;

/**
 * Covers are scaled down to fit this box before encoding.
 * It sits under the 3000px ceiling past which Cloudflare's encoder falls back to baseline JPEG, so the progressive assertion can hold.
 */
export const USER_IMAGE_MAX_EDGE_PX = 1600;

/**
 * Images smaller than this on either axis are refused.
 * Cloudflare's encoder drops to baseline JPEG below 50px, and an image that small is not a usable cover anyway.
 */
export const USER_IMAGE_MIN_EDGE_PX = 50;

/** The JPEG quality every rehosted image is encoded at. */
export const USER_IMAGE_JPEG_QUALITY = 82;

/** A stored key is the sha-256 of the encoded bytes, so equal images share one object and a key can never be guessed into overwriting another. */
const USER_IMAGE_KEY_PATTERN = /^[0-9a-f]{64}\.jpg$/;

/**
 * What an author may paste as a cover source: a full https URL with no embedded credentials.
 * The same schema runs in the edit form for feedback and in the Convex action as the authoritative gate.
 */
export const userImageSourceUrlSchema = z
  .string()
  .trim()
  .min(1, 'Cover image URL is required')
  .max(2048, 'Cover image URL is too long')
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') {
        ctx.addIssue({ code: 'custom', message: 'Cover image must use a full https:// URL' });
        return;
      }
      if (url.username !== '' || url.password !== '') {
        ctx.addIssue({ code: 'custom', message: 'Cover image URL must not carry credentials' });
      }
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Cover image must be a full https:// URL' });
    }
  });

export const userImageIngestRequestSchema = z.strictObject({
  source_url: userImageSourceUrlSchema,
});

export const userImageIngestResponseSchema = z.strictObject({
  url: z.string(),
  key: z.string().regex(USER_IMAGE_KEY_PATTERN),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type UserImageIngestResponse = z.infer<typeof userImageIngestResponseSchema>;

/** The error body every ingest failure carries, so the author sees why their URL was refused rather than a bare status. */
export const userImageIngestErrorSchema = z.strictObject({
  error: z.string(),
});

export function userImagePublicPath(key: string): string {
  return `${USER_IMAGE_PUBLIC_PREFIX}${key}`;
}

/** Returns the stored key a public path names, or null for anything outside the namespace or shaped wrong. */
export function matchUserImagePath(pathname: string): string | null {
  if (!pathname.startsWith(USER_IMAGE_PUBLIC_PREFIX)) {
    return null;
  }
  const key = pathname.slice(USER_IMAGE_PUBLIC_PREFIX.length);
  return USER_IMAGE_KEY_PATTERN.test(key) ? key : null;
}
