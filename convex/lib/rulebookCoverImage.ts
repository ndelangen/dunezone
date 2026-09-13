import { RULEBOOK_COVER_IMAGE_ORIGIN } from '../../src/shared/rulebooks/coverImage';
import { USER_IMAGE_LOCAL_HOSTS } from '../../src/shared/user-images/contract';

/** Production images use the public site; isolated development may use its configured local Worker. */
export function isRulebookCoverImageDeliveryUrl(value: string): boolean {
  const url = new URL(value);
  if (url.origin === RULEBOOK_COVER_IMAGE_ORIGIN) {
    return true;
  }
  const ingestBase = process.env.USER_IMAGE_INGEST_BASE_URL;
  if (!ingestBase) {
    return false;
  }
  try {
    const ingest = new URL(ingestBase);
    return USER_IMAGE_LOCAL_HOSTS.has(ingest.hostname) && url.origin === ingest.origin;
  } catch {
    return false;
  }
}
