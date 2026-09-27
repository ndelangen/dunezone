import { factionAuthoringStatusMessage } from '@ui/content/assetPublishingStatus';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
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
 * The faction routes own the projection and the save state.
 * This owns the glyph that says whether a capture is scheduled, running or done, and the words `factionAuthoringStatusMessage` has always written for the toolbar, with the last publication's time after them.
 * The faction editors keep this status where the asset editors dropped theirs, because it reports real capture progress.
 */
export function FactionPublicationStatus({
  saveState,
  publication,
}: {
  saveState: AuthoringSaveState;
  /** Absent before the faction's first save, which is the create page. */
  publication?: PublicAssetPublishingStatusProjection;
}) {
  const message = factionAuthoringStatusMessage(saveState, publication);
  const label =
    publication?.lastPublishedAt == null
      ? message
      : `${message} Last published ${formatPublishedAt(publication.lastPublishedAt)}`;
  return <StatusMark {...publicationGlyph(publication)} label={label} />;
}
