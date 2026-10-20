import { RULEBOOK_COVER_IMAGE_ORIGIN } from '../../src/shared/rulebooks/coverImage';
import { USER_IMAGE_LOCAL_HOSTS } from '../../src/shared/user-images/contract';

/** Public delivery origins, shared with the editor without exposing credentials. */
export function rulebookCoverImageOrigins(): string[] {
  const origins = [RULEBOOK_COVER_IMAGE_ORIGIN];
  const ingestBase = process.env.USER_IMAGE_INGEST_BASE_URL;
  if (ingestBase) {
    try {
      const ingest = new URL(ingestBase);
      if (USER_IMAGE_LOCAL_HOSTS.has(ingest.hostname)) {
        origins.push(ingest.origin);
      }
    } catch {
      /* An invalid configured origin authorizes no local delivery. */
    }
  }
  return origins;
}

/** Production images use the public site; isolated development may use its configured local Worker. */
export function isRulebookCoverImageDeliveryUrl(value: string): boolean {
  return rulebookCoverImageOrigins().includes(new URL(value).origin);
}
