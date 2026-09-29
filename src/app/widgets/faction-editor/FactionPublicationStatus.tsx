import { factionAssetPublishingCopy } from '@ui/content/assetPublishingStatus';

import type { PublicAssetPublishingStatusProjection } from '@db/factions';

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

/**
 * Where the faction's public sheet has got to, as a sentence Save states after its own state.
 *
 * The faction routes own the projection.
 * This owns the words the faction page states for its files, with the last publication's time after them.
 * It leaves the save cycle to Save, so after a failed save this still says where the publication is.
 * The faction editors keep this where the asset editors dropped theirs, because it reports real capture progress.
 */
export function factionPublicationNote(
  /** Absent before the faction's first save, which is the create page. */
  publication?: PublicAssetPublishingStatusProjection
): string {
  const words = publication
    ? factionAssetPublishingCopy(publication.status, publication.captureStatus)
    : 'Saving this faction schedules its public assets.';
  return publication?.lastPublishedAt == null
    ? words
    : `${words} Last published ${formatPublishedAt(publication.lastPublishedAt)}`;
}
