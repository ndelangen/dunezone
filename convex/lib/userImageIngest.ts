import { ConvexError } from 'convex/values';

import {
  USER_IMAGE_INGEST_PATH,
  USER_IMAGE_LOCAL_HOSTS,
  userImageIngestCompletionSchema,
  userImageIngestErrorSchema,
} from '../../src/shared/user-images/contract';

/**
 * The ingest-call plumbing both rehost pipelines share: covers and avatars post the same request shape to the same Worker endpoint and differ only in capability.
 * There is one way in, and the minted token is the whole credential.
 */

/** The Worker's ingest origin, refused outside https because every ingest call carries a credential: the minted token rides in the body. */
export function ingestBaseUrl(): string {
  const baseUrl = process.env.USER_IMAGE_INGEST_BASE_URL;
  if (!baseUrl) {
    throw new Error('Image storage is not configured for this deployment');
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Image storage is misconfigured: the ingest base URL does not parse');
  }
  if (parsed.protocol !== 'https:' && !USER_IMAGE_LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error('Image storage is misconfigured: the ingest base URL must use https');
  }
  return baseUrl.replace(/\/$/, '');
}

/** Reads a refusal or failure response into the `ConvexError` the caller sees; refusals travel as `ConvexError` because a plain error's message is redacted to "Server Error" outside dev, and these messages exist to be read. */
async function throwIngestFailure(response: Response): Promise<never> {
  const refusal = userImageIngestErrorSchema.safeParse(await response.json().catch(() => null));
  if (response.status >= 400 && response.status < 500 && refusal.success) {
    throw new ConvexError(refusal.data.error);
  }
  throw new ConvexError('The image could not be stored');
}

/**
 * Posts one source URL to the Worker with a minted ledger token and awaits the completion signal.
 * No secret rides this path and the response carries no result: by the time a 200 arrives, the Worker's consuming mutation has already committed the image, so this function only turns failure into an error the caller can report.
 */
export async function ingestWithToken(baseUrl: string, sourceUrl: string, token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${USER_IMAGE_INGEST_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_url: sourceUrl, token }),
    });
  } catch {
    throw new ConvexError('Image storage is unreachable');
  }
  if (!response.ok) {
    await throwIngestFailure(response);
  }
  const completion = userImageIngestCompletionSchema.safeParse(await response.json().catch(() => null));
  if (!completion.success) {
    throw new ConvexError('Image storage answered with an unexpected shape');
  }
}
