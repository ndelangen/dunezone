import { z } from 'zod';

/**
 * The contract between the app, the Convex rehost action and the Worker's user-image endpoints.
 * A user-supplied image URL is fetched once at save time, re-encoded, stored in the user-image bucket and served from our own origin from then on.
 * Everything both sides of that exchange must agree on lives here: paths, limits and the wire shapes.
 */

/** The Worker endpoint the Convex rehost action posts a source URL to, authenticated with a minted ingest token or the legacy shared secret. */
export const USER_IMAGE_INGEST_PATH = '/__user-images/ingest';

/**
 * Hosts where a cleartext endpoint is acceptable on either side of the ingest exchange: local development terminates on the developer's own machine.
 * Everywhere else the ingest call carries a credential (token or legacy secret) and the delivery URL is written into documents, so both must ride https.
 */
export const USER_IMAGE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'host.docker.internal']);

/**
 * The Convex function paths the Worker calls over the deployment's built-in HTTP API.
 * The check is a public query that answers whether a token is live without consuming it;
 * the consume is the public mutation that records the ingest result and burns the token in one transaction.
 */
export const USER_IMAGE_TOKEN_CHECK_FUNCTION = 'ingestTokens:check';
export const USER_IMAGE_TOKEN_CONSUME_FUNCTION = 'ingestTokens:consume';

/**
 * What a minted token may write, and therefore which rendition recipe the Worker runs.
 * The recipe comes from the ledger's own capability record rather than from the request body, so a token holder cannot pick a recipe the mint never authorized.
 */
const USER_IMAGE_INGEST_KINDS = ['ruleset_cover', 'profile_avatar'] as const;

export type UserImageIngestKind = (typeof USER_IMAGE_INGEST_KINDS)[number];

/**
 * What the ledger's check query answers the Worker.
 * `kind` rides along only on a live token;
 * a dead token reveals nothing beyond the boolean.
 * Parsed loose on purpose: a checker that predates a new kind must keep refusing nothing but the boolean.
 */
export const userImageTokenCheckAnswerSchema = z.object({
  valid: z.boolean(),
  kind: z.enum(USER_IMAGE_INGEST_KINDS).optional(),
});

/**
 * An ingest token is 32 bytes of crypto randomness as lowercase hex, 256 bits, so possession is the credential and guessing is hopeless.
 * The same schema gates the Worker's request parse and the Convex ledger functions.
 */
export const userImageIngestTokenSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Invalid ingest token');

/** The public namespace rehosted images are served under, keyed by the content hash of the encoded bytes. */
export const USER_IMAGE_PUBLIC_PREFIX = '/user-images/';

/** The most source bytes the ingest fetch will read before giving up, so a hostile URL cannot stream forever. */
export const USER_IMAGE_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** How long the ingest fetch waits for the source host before failing the save with an honest error. */
export const USER_IMAGE_FETCH_TIMEOUT_MS = 10_000;

/** How many redirect hops the ingest fetch follows, each one re-checked to be https. */
export const USER_IMAGE_MAX_REDIRECTS = 3;

/**
 * The full rendition is scaled down to fit this box before encoding.
 * It sits under the 3000px ceiling past which Cloudflare's encoder falls back to baseline JPEG, so the progressive assertion can hold.
 */
export const USER_IMAGE_MAX_EDGE_PX = 1600;

/**
 * The thumb rendition's box, sized for grid tiles and chips so list pages stop paying for full-size bytes.
 * Every cover ingest stores both renditions;
 * a render site picks the one that fits its frame.
 */
export const USER_IMAGE_THUMB_EDGE_PX = 320;

/**
 * The avatar rendition's square box, center-cropped at encode time.
 * One rendition only: the largest avatar render is the profile band at 96px CSS, so 320 covers every site at 2x DPR with headroom, and squareness becomes a property of the stored asset instead of every consumer's problem.
 */
export const USER_IMAGE_AVATAR_EDGE_PX = 320;

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
 * What an author may supply as an image source: a full https URL with no embedded credentials.
 * The noun only changes the messages, so both pipelines share one floor while each edit form speaks about its own field.
 */
function makeUserImageSourceUrlSchema(noun: string) {
  return z
    .string()
    .trim()
    .min(1, `${noun} URL is required`)
    .max(2048, `${noun} URL is too long`)
    .superRefine((value, ctx) => {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:') {
          ctx.addIssue({ code: 'custom', message: `${noun} must use a full https:// URL` });
          return;
        }
        if (url.username !== '' || url.password !== '') {
          ctx.addIssue({ code: 'custom', message: `${noun} URL must not carry credentials` });
        }
      } catch {
        ctx.addIssue({ code: 'custom', message: `${noun} must be a full https:// URL` });
      }
    });
}

/**
 * The cover source floor.
 * The same schema runs in the edit form for feedback and in the Convex action as the authoritative gate.
 */
export const userImageSourceUrlSchema = makeUserImageSourceUrlSchema('Cover image');

/**
 * The avatar source floor, gating the async rehost action and the operator backfill.
 * Stricter than the profile edit form's own https check (it adds the length cap and the credentials ban);
 * a seeded provider URL that fails it keeps rendering externally until the backfill reports it.
 */
export const userAvatarSourceUrlSchema = makeUserImageSourceUrlSchema('Avatar image');

export const userImageIngestRequestSchema = z.strictObject({
  source_url: userImageSourceUrlSchema,
  /**
   * The minted ledger token selecting the introspection path.
   * Absent on the legacy path, where the bearer header authenticates instead;
   * that path retires with the shared secret.
   */
  token: userImageIngestTokenSchema.optional(),
});

export const userImageIngestResponseSchema = z.strictObject({
  url: z.string(),
  key: z.string().regex(USER_IMAGE_KEY_PATTERN),
  thumb_url: z.string(),
  thumb_key: z.string().regex(USER_IMAGE_KEY_PATTERN),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type UserImageIngestResponse = z.infer<typeof userImageIngestResponseSchema>;

/**
 * What the token path answers the caller with: a completion signal only.
 * The stored result reaches Convex through the Worker's consuming mutation, never through this response body.
 */
export const userImageIngestCompletionSchema = z.strictObject({
  ok: z.literal(true),
});

/**
 * A delivery URL the consuming mutation will accept: the user-image path shape over a content-addressed key, on an https origin or a local development host.
 * The consume endpoint is public, so this floor bounds what a token holder could write into a document.
 * It pins the protocol and the path shape, not the host;
 * pinning the host would need the delivery origin configured on the Convex side and rides the hardening ticket.
 */
const userImageDeliveryUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && USER_IMAGE_LOCAL_HOSTS.has(url.hostname))) {
      return false;
    }
    return matchUserImagePath(url.pathname) !== null;
  }, 'Not a user-image delivery URL');

/**
 * The semantic floor for the Worker's consuming callback on a cover token, parsed inside the consume mutation.
 * The mutation is public, so every field is bounded: two delivery URLs in our namespace, dimensions inside the encoder's box, and at most four content-addressed R2 keys.
 */
export const userImageIngestCallbackSchema = z.strictObject({
  url: userImageDeliveryUrlSchema,
  thumb_url: userImageDeliveryUrlSchema,
  width: z.number().int().min(1).max(USER_IMAGE_MAX_EDGE_PX),
  height: z.number().int().min(1).max(USER_IMAGE_MAX_EDGE_PX),
  r2_keys: z.array(z.string().regex(USER_IMAGE_KEY_PATTERN)).min(1).max(4),
});

/**
 * The floor for the callback on an avatar token: exactly one delivery URL, square dimensions inside the avatar box, exactly one key.
 * Strict on purpose;
 * a payload carrying the cover shape's thumb fields is refused rather than trimmed, so a mixed-up recipe cannot land half an avatar.
 */
export const userImageAvatarIngestCallbackSchema = z
  .strictObject({
    url: userImageDeliveryUrlSchema,
    width: z.number().int().min(1).max(USER_IMAGE_AVATAR_EDGE_PX),
    height: z.number().int().min(1).max(USER_IMAGE_AVATAR_EDGE_PX),
    r2_keys: z.array(z.string().regex(USER_IMAGE_KEY_PATTERN)).length(1),
  })
  .refine((value) => value.width === value.height, 'Avatar rendition must be square');

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
