import { RULEBOOK_COVER_IMAGE_ORIGIN } from '../../src/shared/rulebooks/coverImage';
import { USER_IMAGE_LOCAL_HOSTS } from '../../src/shared/user-images/contract';

/** Public delivery origins, shared with the editor without exposing credentials. */
export function rulebookCoverImageOrigins(): string[] {
  const origins = [RULEBOOK_COVER_IMAGE_ORIGIN];
  const ingestBase = process.env.USER_IMAGE_INGEST_BASE_URL;
  if (!ingestBase) {
    return origins;
  }
  try {
    const ingest = new URL(ingestBase);
    if (!USER_IMAGE_LOCAL_HOSTS.has(ingest.hostname)) {
      return origins;
    }
    origins.push(ingest.origin);
    const publicBase = process.env.USER_IMAGE_PUBLIC_BASE_URL;
    if (publicBase) {
      const delivery = new URL(publicBase);
      if (
        USER_IMAGE_LOCAL_HOSTS.has(delivery.hostname) &&
        ['http:', 'https:'].includes(delivery.protocol) &&
        delivery.username === '' &&
        delivery.password === ''
      ) {
        origins.push(delivery.origin);
      }
    }
  } catch {
    /* Invalid configuration authorizes no additional delivery origin. */
  }
  return origins;
}

/** Production images use the public site; isolated development may use its configured local app proxy. */
export function isRulebookCoverImageDeliveryUrl(value: string): boolean {
  return rulebookCoverImageOrigins().includes(new URL(value).origin);
}
