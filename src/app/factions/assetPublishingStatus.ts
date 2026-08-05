import type {
  PublicAssetCaptureStatus,
  PublicAssetPublishingStatus,
} from '../../../convex/assetPublishingStatus';
import type { FactionSaveState } from './authoringState';

const statusCopy: Record<PublicAssetPublishingStatus, string> = {
  current: 'Public assets are current.',
};

export function factionAssetPublishingCopy(
  status: PublicAssetPublishingStatus | null,
  saveState: FactionSaveState = 'idle',
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
  return captureStatus
    ? `Saved. ${publishingCopy}`
    : `Saved. Publication scheduled. ${publishingCopy}`;
}
