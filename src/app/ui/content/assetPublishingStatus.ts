import type {
  PublicAssetCaptureStatus,
  PublicAssetPublishingStatus,
  PublicAssetPublishingStatusProjection,
} from '@db/factions';

/** Where an editor is in its save cycle; the copy below leads with it when it is not idle. */
export type AuthoringSaveState = 'idle' | 'saving' | 'saved' | 'error';

const statusCopy: Record<PublicAssetPublishingStatus, string> = {
  current: 'Public assets are current.',
};

export function factionAssetPublishingCopy(
  status: PublicAssetPublishingStatus | null,
  saveState: AuthoringSaveState = 'idle',
  captureStatus: PublicAssetCaptureStatus | null = null
) {
  if (saveState === 'saving') {
    return 'Saving changes…';
  }
  if (saveState === 'error') {
    return 'Changes were not saved.';
  }

  const publishingCopy =
    captureStatus === 'in_progress'
      ? `A new faction sheet capture is in progress.${status === 'current' ? ' The current PDF remains available.' : ''}`
      : captureStatus === 'scheduled'
        ? `A new faction sheet capture is scheduled.${status === 'current' ? ' The current PDF remains available.' : ''}`
        : status
          ? statusCopy[status]
          : 'The public asset will be available soon.';
  if (saveState !== 'saved') {
    return publishingCopy;
  }
  return captureStatus ? `Saved. ${publishingCopy}` : `Saved. Publication scheduled. ${publishingCopy}`;
}

/**
 * The faction editors' toolbar status line: publication-aware once a projection exists, with pre-first-publication fallbacks for the create flow and fresh saves.
 */
export function factionAuthoringStatusMessage(
  saveState: AuthoringSaveState,
  assetPublishing?: PublicAssetPublishingStatusProjection
): string {
  if (assetPublishing) {
    return factionAssetPublishingCopy(assetPublishing.status, saveState, assetPublishing.captureStatus);
  }
  switch (saveState) {
    case 'error':
      return 'Changes were not saved.';
    case 'saved':
      return 'Saved. Publication scheduled.';
    default:
      return 'Saving this faction schedules its public assets.';
  }
}
