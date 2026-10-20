import { RULEBOOK_COVER_IMAGE_ORIGIN } from '../../src/shared/rulebooks/coverImage';
import { USER_IMAGE_LOCAL_HOSTS } from '../../src/shared/user-images/contract';

/** Production images use the public site; isolated development can deliver through its configured local app proxy. */
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
    if (!USER_IMAGE_LOCAL_HOSTS.has(ingest.hostname)) {
      return false;
    }
    if (url.origin === ingest.origin) {
      return true;
    }
    const publicBase = process.env.USER_IMAGE_PUBLIC_BASE_URL;
    if (!publicBase) {
      return false;
    }
    const delivery = new URL(publicBase);
    return (
      USER_IMAGE_LOCAL_HOSTS.has(delivery.hostname) &&
      ['http:', 'https:'].includes(delivery.protocol) &&
      delivery.username === '' &&
      delivery.password === '' &&
      url.origin === delivery.origin
    );
  } catch {
    return false;
  }
}
