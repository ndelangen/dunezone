import { factionAssetPublishingCopy } from '@ui/content/assetPublishingStatus';
import { StatusMark } from '@ui/content/StatusMark';
import type { StatusMarkProps } from '@ui/content/StatusMark';
import { FileText, History, ImageOff, RefreshCw } from 'lucide-react';

import type { PublicAssetPublishingStatusProjection } from '@db/factions';

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function publicationGlyph(
  publication: PublicAssetPublishingStatusProjection | undefined
): Pick<StatusMarkProps, 'tone' | 'icon'> {
  /* A failed replacement leaves the current publication in place (CONTEXT.md, Asset publication state), so it reads as no capture, as the words do. */
  const capture = publication?.captureStatus === 'error' ? null : publication?.captureStatus;
  switch (true) {
    case capture === 'in_progress':
      return { tone: 'progress', icon: <RefreshCw size={16} aria-hidden /> };
    case capture === 'scheduled':
      return { tone: 'pending', icon: <History size={16} aria-hidden /> };
    case publication?.status === 'current':
      return { tone: 'neutral', icon: <FileText size={16} aria-hidden /> };
    default:
      return { tone: 'neutral', icon: <ImageOff size={16} aria-hidden /> };
  }
}

/**
 * Where the faction's public sheet has got to, as one of the authoring toolbar's status marks.
 *
 * The faction routes own the projection.
 * This owns the glyph that says whether a capture is scheduled, running or done, and the words the faction page states for its files, with the last publication's time after them.
 * It leaves the save cycle to the toolbar's own save mark, so after a failed save this still says where the publication is.
 * The faction editors keep this status where the asset editors dropped theirs, because it reports real capture progress.
 */
export function FactionPublicationStatus({
  publication,
}: {
  /** Absent before the faction's first save, which is the create page. */
  publication?: PublicAssetPublishingStatusProjection;
}) {
  const words = publication
    ? factionAssetPublishingCopy(publication.status, publication.captureStatus)
    : 'Saving this faction schedules its public assets.';
  const label =
    publication?.lastPublishedAt == null
      ? words
      : `${words} Last published ${formatPublishedAt(publication.lastPublishedAt)}`;
  return <StatusMark {...publicationGlyph(publication)} label={label} />;
}
